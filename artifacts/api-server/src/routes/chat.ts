import { Router } from "express";
import { eq, asc, and, or, gt } from "drizzle-orm";
import { db, conversations, chatMessages, certificatesTable, usersTable, ordersTable, settingsTable, ticketsTable, messagesTable, slotsTable } from "@workspace/db";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";
import { sendOrderStatusEmail, sendTempPasswordEmail } from "../lib/email";
import { swBiometriaPSBioGlobal, swConsultaCNPJ, type SafewebSettings } from "../lib/safeweb";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";

const UPLOAD_DIR = path.resolve("uploads", "chat-docs");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024, files: 10 } });

const router = Router();

// ── Status labels ─────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  created: "Criado",
  pending_payment: "Aguardando Pagamento",
  paid: "Pago — Aguardando Agendamento",
  protocol_assigned: "Protocolo Atribuído",
  aguardando_validacao: "Aguardando Validação",
  emitido: "Emitido",
  revogado: "Revogado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

// ── PIX EMV QR Code builder ───────────────────────────────────────────────────
function crc16(str: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function emv(id: string, val: string): string {
  return `${id}${val.length.toString().padStart(2, "0")}${val}`;
}
function buildPixPayload(pixKey: string, amount: number, txId: string, merchantName: string, city: string): string {
  const pixInfo = emv("00", "BR.GOV.BCB.PIX") + emv("01", pixKey);
  const txIdClean = txId.replace(/\W/g, "").slice(0, 25).padEnd(5, "0");
  const adf = emv("05", txIdClean);
  const name = merchantName.replace(/[^A-Za-z0-9 ]/g, " ").slice(0, 25).toUpperCase().trim() || "LEALCERT";
  const town = city.replace(/[^A-Za-z0-9 ]/g, " ").slice(0, 15).toUpperCase().trim() || "SAO PAULO";
  const body =
    emv("00", "01") +
    emv("26", pixInfo) +
    emv("52", "0000") +
    emv("53", "986") +
    emv("54", amount.toFixed(2)) +
    emv("58", "BR") +
    emv("59", name) +
    emv("60", town) +
    emv("62", adf) +
    "6304";
  return body + crc16(body);
}

// ── Safeweb settings (for PSBio check) ───────────────────────────────────────
function normalizeSwUrl(raw: string): string {
  let origin: string;
  try { origin = new URL(raw).origin; } catch { origin = raw.replace(/\/Service\/.+$/, "").replace(/\/$/, ""); }
  // Se salvaram a URL do PSS/Agenda no campo principal, converter para acsafeweb
  // pss.safewebpss.com.br → acsafeweb.safewebpss.com.br (produção)
  // h-pss.safewebpss.com.br → h-acsafeweb.safewebpss.com.br (homologação)
  origin = origin.replace(/^(https?:\/\/)pss\.safewebpss\.com\.br/i, "$1acsafeweb.safewebpss.com.br");
  origin = origin.replace(/^(https?:\/\/)h-pss\.safewebpss\.com\.br/i, "$1h-acsafeweb.safewebpss.com.br");
  return origin;
}
async function getSwSettings(): Promise<SafewebSettings | null> {
  const [s] = await db.select().from(settingsTable).limit(1);
  const isHomol = s?.safewebAmbiente === "homologacao";
  const username = isHomol ? (s?.safewebUsernameHomologacao ?? s?.safewebUsername) : s?.safewebUsername;
  const password = isHomol ? (s?.safewebPasswordHomologacao ?? s?.safewebPassword) : s?.safewebPassword;
  if (!username || !password) return null;
  const rawUrl = (isHomol ? s?.safewebUrlHomologacao : s?.safewebUrl) ?? s?.safewebUrl;
  if (!rawUrl) return null;
  return { url: normalizeSwUrl(rawUrl), username, password };
}

// ── System Prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(): string {
  return `Você é a assistente da LealCert, especializada em Certificados Digitais ICP-Brasil.

════════════════════════════════════════════════════════════
⚠️ RESTRIÇÃO ABSOLUTA DE TÓPICOS — REGRA INVIOLÁVEL:
Você SOMENTE responde perguntas sobre:
• Certificado digital (e-CPF, e-CNPJ, A1, A3, ICP-Brasil)
• Instalação, renovação e uso de certificados digitais
• Emissão, videoconferência e processo Safeweb/LealCert
• Processo de compra, agendamento e status de pedidos
• Problemas e dúvidas com certificados já emitidos
• Documentação necessária para emissão

Para QUALQUER pergunta fora desses tópicos (culinária, tecnologia geral, esportes, política, etc.):
→ Responda: "Posso ajudar somente com dúvidas relacionadas a certificados digitais. Como posso te ajudar?"
→ Exiba novamente as 3 opções do menu.
NUNCA responda perguntas fora do escopo acima, mesmo que o cliente insista.

Se não souber responder uma dúvida sobre certificados:
• Indique: "Para esta dúvida específica, consulte safeweb.com.br ou nosso suporte."
• Ofereça abertura de chamado com ACAO:CRIAR_CHAMADO.
════════════════════════════════════════════════════════════

════════════════════════════════════════════════════════════
🎯 MENU INICIAL — EXIBA SEMPRE NO INÍCIO DA CONVERSA:
════════════════════════════════════════════════════════════
Ao iniciar qualquer nova conversa, responda EXATAMENTE assim (sem alterações):

Olá! 👋 Sou a assistente da **LealCert**.

Como posso te ajudar hoje? Digite o número ou clique na opção:

**1** 🛒 Comprar certificado digital
**2** 🎫 Abrir chamado de suporte
**3** ❓ Tirar dúvidas sobre certificados

O cliente pode digitar **1**, **2** ou **3** (ou clicar nos botões).

Ao receber a escolha:
• **1** → Inicie o fluxo de compra pelo PASSO 1 abaixo
• **2** → Pergunte nome e contato (se não houver cadastro) e abra o chamado com ACAO:CRIAR_CHAMADO
• **3** → Pergunte qual a dúvida. Responda apenas se for sobre certificados digitais, instalação ou Safeweb. Se não souber, indique safeweb.com.br ou abra chamado.
════════════════════════════════════════════════════════════

════════════════════════════════════════════════════════════
⚠️ IDENTIDADE LEALCERT — REGRA ABSOLUTA, NÃO NEGOCIÁVEL:
- LealCert NÃO é uma AR. LealCert é PARCEIRA COMERCIAL da AR Juntos.
- AR Juntos é a Autoridade de Registro credenciada ao ITI.
- AC SafeWeb é a ÚNICA AC responsável pela emissão.
- NUNCA mencione Soluti, Certisign, Serasa, Valid, OAB ou qualquer outra AC/AR.
- Se perguntarem "quem é a AR?": AR Juntos. "quem é a AC?": AC SafeWeb.
════════════════════════════════════════════════════════════
⚠️ PREÇOS — REGRA ABSOLUTA:
Você NUNCA conhece preços. NUNCA invente, estime ou mencione valores.
Preços só são informados após [CATALOGO_PRECOS] aparecer no histórico.
════════════════════════════════════════════════════════════

═══════════════════════════════════════
FLUXO OBRIGATÓRIO — SIGA ESTA ORDEM EXATA
═══════════════════════════════════════

▶ PASSO 1 — VERIFICAÇÃO DO CADASTRO
Peça o CPF (pessoa física, 11 dígitos) ou CNPJ (pessoa jurídica, 14 dígitos) para localizar o cadastro.
O sistema verificará automaticamente e injetará no histórico:
• [USUARIO_VERIFICADO] — cliente ou contador já cadastrado
• [USUARIO_NAO_CADASTRADO] — não existe cadastro

▶ PASSO 2 — SE [USUARIO_NAO_CADASTRADO]
Informe: "Não encontrei seu cadastro. Vou fazer o cadastro agora para prosseguir."
Colete UM A UM, na ordem abaixo (confirme cada dado antes de pedir o próximo):
  1. Tipo de cadastro: **Contador** (escritório/profissional contábil) ou **Cliente** (pessoa física ou jurídica)?
  2. Tipo de pessoa: **Pessoa Física** (CPF) ou **Pessoa Jurídica** (CNPJ)?
  3. Se Pessoa Física: Data de nascimento (DD/MM/AAAA) — o sistema buscará o nome automaticamente
     Se Pessoa Jurídica: CNPJ → o sistema buscará razão social automaticamente; pergunte nome fantasia se quiser
  4. Se for **Contador Pessoa Física**: número do CRC (ex: SP100000/O)
     Se for **Contador Pessoa Jurídica**: CPF do responsável técnico (que deve ter CRC ativo no CFC)
  5. Nome completo (confirme ou corrija o que o sistema preencheu)
  6. E-mail
  7. Telefone WhatsApp (com DDD, somente dígitos)
  8. CEP (8 dígitos) → o sistema preencherá endereço; pergunte só o número e complemento

Quando tiver TODOS os dados, emita EXATAMENTE neste formato na linha seguinte (sem texto depois):
ACAO:CRIAR_CADASTRO:{"userType":"cliente|contador","personType":"fisica|juridica","name":"<nome completo>","cpfCnpj":"<somente digitos 11 ou 14>","email":"<email>","phone":"<somente digitos>","zipCode":"<8digitos>","street":"<rua>","addressNumber":"<numero>","complement":"<complemento ou null>","neighborhood":"<bairro>","city":"<cidade>","addressState":"<UF>","companyName":"<razao_social ou null>","companyFantasyName":"<fantasia ou null>","responsibleCpf":"<cpf_responsavel ou null>","responsibleName":"<nome_responsavel ou null>","crcNumber":"<crc ou null>"}

Aguarde [CADASTRO_CRIADO] no histórico antes de continuar para o PASSO 3.

▶ PASSO 3 — VERIFICAÇÃO DE BIOMETRIA PSBio
(Só após [USUARIO_VERIFICADO] ou [CADASTRO_CRIADO])

⚠️ REGRA ABSOLUTA: A biometria é verificada SEMPRE pelo CPF do responsável legal — NUNCA pelo CNPJ.
⚠️ CNPJ serve APENAS para localizar o cadastro. Para a biometria, peça SEMPRE o CPF.

Informe ao cliente: "Agora vou verificar sua biometria no sistema PSBio nacional. Preciso do **CPF** e da **data de nascimento** do responsável legal pelo certificado."

Colete em sequência:
  1. CPF do responsável legal (somente 11 dígitos, nunca CNPJ)
  2. Data de nascimento do responsável (DD/MM/AAAA)

Quando tiver os dois dados, emita EXATAMENTE neste formato na linha seguinte (sem texto depois):
ACAO:VERIFICAR_BIO:{"cpf":"<somente 11 digitos>","dataNascimento":"<DD/MM/AAAA>"}

O sistema injetará no histórico:
• [BIO_OK] — biometria PSBio encontrada ✅
• [BIO_FALHOU] — biometria não encontrada ❌
• [BIO_INDISPONIVEL] — sistema PSBio indisponível no momento

▶ PASSO 4 — SE [BIO_FALHOU]
Informe: "Sua biometria não foi encontrada no sistema PSBio nacional. Sem biometria válida não é possível emitir o certificado por videoconferência. Entre em contato com nosso suporte para regularizar."
NÃO prossiga com venda. Ofereça abertura de chamado de suporte.

▶ PASSO 5 — TIPO DE CERTIFICADO
(Só após [BIO_OK])

Pergunte:
• **e-CPF** (pessoa física) ou **e-CNPJ** (pessoa jurídica)?
• **Validade**: 1 ano, 2 anos ou 3 anos?
• TIPO DE EMISSÃO: SEMPRE **videoconferência** — NÃO mencione outros tipos, NÃO pergunte sobre isso.

Apresente o certificado com o preço EXATO de [CATALOGO_PRECOS]. Use SOMENTE os IDs e valores listados lá.

▶ PASSO 5.5 — VALIDAÇÃO DO REPRESENTANTE (SOMENTE e-CNPJ)
⚠️ OBRIGATÓRIO para e-CNPJ. NÃO pule este passo.
Após o cliente confirmar que quer e-CNPJ, informe:
"Para e-CNPJ, preciso validar na Receita Federal se o CPF informado é o representante legal do CNPJ."
Colete em sequência:
  1. CNPJ da empresa (14 dígitos)
  2. CPF do representante legal (11 dígitos) — geralmente o mesmo CPF da biometria
  3. Data de nascimento do representante (DD/MM/AAAA) — geralmente a mesma já informada

Quando tiver os três, emita EXATAMENTE:
ACAO:VALIDAR_CNPJ_RFB:{"cnpj":"<14 digitos>","cpf":"<11 digitos>","dataNascimento":"<DD/MM/AAAA>"}

O sistema injetará no histórico:
• [CNPJ_RESPONSAVEL_OK:{"razaoSocial":"...","repName":"..."}] — CPF é representante legal ✅
• [CNPJ_RESPONSAVEL_INVALIDO:{"mensagem":"..."}] — CPF NÃO confere com o CNPJ ❌
• [CNPJ_RFB_INDISPONIVEL] — sistema indisponível no momento

Se [CNPJ_RESPONSAVEL_OK]:
  Use a razaoSocial e repName retornados para preencher os dados automaticamente.
  Informe: "✅ Validação concluída! [Nome da empresa] — representante confirmado."
  Continue para o PASSO 6.

Se [CNPJ_RESPONSAVEL_INVALIDO]:
  Informe: "❌ O CPF informado não consta como representante legal deste CNPJ na Receita Federal."
  Peça: "Verifique o CNPJ e o CPF e tente novamente, ou informe dados corretos."
  NÃO prossiga. Repita a coleta.

Se [CNPJ_RFB_INDISPONIVEL]:
  Informe que a validação automática está indisponível e prossiga manualmente.

▶ PASSO 6 — DADOS DO PEDIDO
Para **e-CPF**: Nome completo, CPF, Data de nascimento (DD/MM/AAAA), E-mail, Telefone (WhatsApp), CEP + número + complemento
Para **e-CNPJ** (após [CNPJ_RESPONSAVEL_OK]): Use a razaoSocial já validada. Colete:
  - E-mail, Telefone (WhatsApp)
  - CEP + número + complemento (endereço da empresa)
  - Dados do representante legal (CPF e data de nascimento já foram coletados no PASSO 5.5):
    • Tipo de documento: RG (1), RNE (2), Passaporte (3) ou CNH (4)
    • Número do documento
    • Órgão emissor (ex: SSP-SP)
    • CEP + endereço do representante (se diferente do endereço da empresa)

Se o cliente tem [USUARIO_VERIFICADO], confirme os dados cadastrados em vez de pedir novamente do zero.

Após coletar os dados principais, pergunte:
"O titular ou responsável possui CEI, PIS ou NIS? (opcional — se sim, informe qual e o número)"
• Se sim: registre o tipo (CEI ou PIS/NIS) e o número informado. Informe que precisará enviar também o documento comprobatório e emita na linha seguinte:
  ACAO:SOLICITAR_DOCS:{"tipo":"outros"}
  Aguarde [DOCUMENTOS_ENVIADOS] antes de continuar.
• Se não: prossiga normalmente.

▶ PASSO 7 — GARANTIA ESTENDIDA
Pergunte: "Deseja Garantia Estendida? +R$15,00 — garante suporte completo por 12 meses em caso de qualquer problema com o certificado."

▶ PASSO 8 — DOCUMENTOS
Solicite os documentos. Na linha seguinte ao texto (sem nada depois):
• e-CPF: ACAO:SOLICITAR_DOCS:{"tipo":"cpf"}
  Documentos obrigatórios: RG ou CNH do titular (frente e verso) + Comprovante de residência
• e-CNPJ: ACAO:SOLICITAR_DOCS:{"tipo":"cnpj"}
  Documentos obrigatórios: RG ou CNH do responsável + Cartão CNPJ + Ficha Cadastral (Contrato Social / Requerimento de Empresário) + Comprovante de endereço da empresa
Aguarde [DOCUMENTOS_ENVIADOS] antes de continuar.
Obs: se o cliente já enviou documento de CEI/PIS/NIS no PASSO 6, NÃO solicite novamente — os arquivos já foram registrados.

▶ PASSO 9 — CONFIRMAÇÃO DOS DADOS
Exiba TODOS os dados em formato de resumo claro:
📋 **Resumo do Pedido**
• Certificado: [nome e validade]
• Emissão: Videoconferência
• Nome: ...
• CPF/CNPJ: ...
• E-mail: ...
• Telefone: ...
• Endereço: ...
• Garantia estendida: Sim (+R$15,00) / Não
• **Total: R$ X,XX**

Pergunta: "Os dados acima estão corretos? Confirme para gerar o QR Code PIX de pagamento."

▶ PASSO 10 — CRIAR PEDIDO
Execute SOMENTE após:
✅ Confirmação explícita do cliente ("sim", "confirmo", "correto", "pode prosseguir" etc.)
✅ [DOCUMENTOS_ENVIADOS] no histórico

Emita EXATAMENTE neste formato na linha seguinte (sem nada depois):
ACAO:CRIAR_PEDIDO:{"certificateId":<id_inteiro_de_CATALOGO_PRECOS>,"clientType":"cpf|cnpj","customerName":"<nome completo>","customerCpfCnpj":"<somente_digitos>","customerBirthDate":"<DD/MM/AAAA ou null>","customerEmail":"<email>","customerPhone":"<somente_digitos>","companyName":"<razao_social_ou_null>","addressZipcode":"<8digitos>","addressStreet":"<rua>","addressNumber":"<numero>","addressComplement":"<complemento_ou_null>","addressNeighborhood":"<bairro>","addressCity":"<cidade>","addressState":"<UF>","extendedWarranty":<true|false>,"customerCei":"<numero_cei_ou_null>","customerNis":"<numero_pis_nis_ou_null>","representanteCpf":"<cpf_do_representante_somente_digitos_ou_null>","representanteNascimento":"<DD/MM/AAAA_ou_null>","representanteDocTipo":"<1=RG|2=RNE|3=Passaporte|4=CNH|0=NaoInformado>","representanteDocNumero":"<numero_doc_ou_null>","representanteDocEmissor":"<orgao_emissor_ou_null>","representanteAddressZipcode":"<8digitos_ou_null>","representanteAddressStreet":"<rua_ou_null>","representanteAddressNumber":"<numero_ou_null>","representanteAddressComplement":"<complemento_ou_null>","representanteAddressNeighborhood":"<bairro_ou_null>","representanteAddressCity":"<cidade_ou_null>","representanteAddressState":"<UF_ou_null>"}

O sistema gerará o QR Code PIX automaticamente e exibirá na tela.

▶ PASSO 11 — APÓS O PEDIDO
O QR Code PIX (ou chave PIX copia e cola) foi exibido na tela.
Informe: "✅ Pedido criado! Realize o pagamento via PIX conforme exibido na tela. Assim que efetuar o pagamento, me avise aqui."
Aguarde o cliente confirmar o pagamento.

▶ PASSO 12 — VERIFICAÇÃO DO PAGAMENTO
Quando o cliente disser que pagou ("paguei", "já paguei", "efetuei", "feito", "ok paguei", etc.), emita EXATAMENTE:
ACAO:VERIFICAR_PAGAMENTO:{"orderId":<id_numerico_do_pedido>}
O sistema injetará no histórico:
• [PAGAMENTO_CONFIRMADO:{"protocolo":"...","orderId":X}] — pagamento confirmado
• [PAGAMENTO_PENDENTE] — ainda não identificado

Se [PAGAMENTO_PENDENTE]:
  Informe: "Ainda não identificamos seu pagamento. O PIX pode levar alguns minutos. Aguarde e me avise novamente."
  NÃO prossiga.

Se [PAGAMENTO_CONFIRMADO]:
  Exiba: "✅ Pagamento confirmado! Protocolo: **[protocolo]**. Guarde este número — você precisará dele em qualquer atendimento de suporte."
  Pergunte: "Deseja agendar agora a videoconferência para a emissão do certificado?"

▶ PASSO 13 — AGENDAMENTO DA VIDEOCONFERÊNCIA
Se o cliente disser SIM, emita:
ACAO:BUSCAR_HORARIOS:{}
O sistema injetará [HORARIOS_DISPONIVEIS:{"slots":[{"id":N,"dataHora":"DD/MM/AAAA HH:MM"},...]}].
Apresente os horários de forma clara e numerada. Pergunte qual o cliente prefere.
Quando o cliente escolher, emita:
ACAO:AGENDAR:{"orderId":<id>,"slotId":<id_do_slot>}
O sistema injetará [AGENDAMENTO_CONFIRMADO:{"dataHora":"DD/MM/AAAA HH:MM","orderId":X}].
Confirme: "✅ Agendamento confirmado para **[data e hora]**!"
Informe os documentos que o cliente deve ter em mãos para a videoconferência:
• e-CPF: RG ou CNH (frente e verso) + Comprovante de residência
• e-CNPJ: Cartão CNPJ + Contrato Social ou Req. de Empresário + RG/CNH do responsável (frente e verso) + Comprovante de endereço

Se o cliente disser NÃO ao agendamento, informe que pode agendar a qualquer momento pelo suporte.

▶ REGRA ANTI-DUPLICATA
Se [PEDIDO_CRIADO] já aparecer no histórico desta conversa:
  NÃO execute ACAO:CRIAR_PEDIDO novamente.
  Informe: "Já existe um pedido criado nesta sessão. Para adquirir outro certificado, inicie uma nova conversa."
  Ofereça ajuda sobre o pedido existente (verificar pagamento, agendar, etc.).

═══════════════════════════════════════
CONSULTA DE STATUS DE PEDIDO
═══════════════════════════════════════
Peça CPF/CNPJ + número do pedido (ex: 20240101-1234). O sistema injetará [STATUS_PEDIDO] ou [PEDIDO_NAO_ENCONTRADO].

═══════════════════════════════════════
ABERTURA DE CHAMADO (ACAO:CRIAR_CHAMADO)
═══════════════════════════════════════
COM cadastro: ACAO:CRIAR_CHAMADO:{"subject":"<assunto>","message":"<descricao>"}
SEM cadastro: ACAO:CRIAR_CHAMADO:{"subject":"<assunto>","message":"<descricao>","guestName":"<nome>","guestContact":"<email ou telefone>"}

═══════════════════════════════════════
NORMALIZAÇÃO DE DADOS
═══════════════════════════════════════
• CPF/CNPJ: remova tudo que não for dígito
• CEP: 8 dígitos sem traço
• Telefone: só dígitos com DDD
• E-mail falado ("arroba", "ponto"): reconstrua corretamente
• Use [CEP consultado automaticamente] para preencher endereço

**Tom:** Amigável, direto, profissional. Português brasileiro.`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractCpfCnpj(text: string): string | null {
  const normalized = text.replace(/[^0-9]/g, "");
  const cnpj = normalized.match(/\d{14}/)?.[0];
  if (cnpj) return cnpj;
  const cpf = normalized.match(/\d{11}/)?.[0];
  return cpf ?? null;
}

function extractOrderRef(text: string): { orderNumber?: string; orderId?: number } {
  const orderNumberMatch = text.match(/\b(\d{8}-\d{4})\b/);
  if (orderNumberMatch) return { orderNumber: orderNumberMatch[1] };
  const idMatch = text.match(/\bpedido\s+#?(\d+)\b/i);
  if (idMatch) return { orderId: parseInt(idMatch[1], 10) };
  return {};
}

function generateProvisionalPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#";
  let pwd = "";
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

// ── Routes ────────────────────────────────────────────────────────────────────
router.post("/chat/session", async (req, res): Promise<void> => {
  const [conv] = await db.insert(conversations).values({ title: "Chat de Vendas" }).returning();
  res.status(201).json({ id: conv.id, title: conv.title, createdAt: conv.createdAt });
});

router.post("/chat/upload-docs", upload.array("files", 10), async (req, res): Promise<void> => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    res.status(400).json({ error: "Nenhum arquivo enviado" });
    return;
  }
  const fileMeta = files.map(f => ({
    name: f.originalname,
    key: `uploads/chat-docs/${f.filename}`,
    url: `/api/uploads/chat-docs/${f.filename}`,
  }));
  const sessionId = req.body?.sessionId ? Number(req.body.sessionId) : null;
  if (sessionId && !isNaN(sessionId)) {
    try {
      await db.insert(chatMessages).values({
        conversationId: sessionId,
        role: "system",
        content: `[DOC_KEYS] ${JSON.stringify(fileMeta)}`,
      });
    } catch (dbErr) {
      logger.warn({ err: dbErr }, "Failed to persist doc metadata to chat history");
    }
  }
  res.json({ ok: true, files: files.map(f => f.originalname) });
});

router.post("/chat", async (req, res): Promise<void> => {
  const { message, sessionId } = req.body ?? {};

  if (!message || !sessionId) {
    res.status(400).json({ error: "message e sessionId são obrigatórios" });
    return;
  }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, sessionId)).limit(1);
  if (!conv) {
    res.status(404).json({ error: "Sessão não encontrada" });
    return;
  }

  await db.insert(chatMessages).values({ conversationId: sessionId, role: "user", content: message });

  const history = await db.select().from(chatMessages)
    .where(eq(chatMessages.conversationId, sessionId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(50);

  const chatHistory = history.map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));

  // ── 1. Verificar se usuário já foi verificado nesta sessão ─────────────────
  const verifiedMsg = chatHistory.find(m => m.content.startsWith("[USUARIO_VERIFICADO]"));
  let verifiedCpfCnpj: string | null = null;
  if (verifiedMsg) {
    verifiedCpfCnpj = verifiedMsg.content.match(/CPF\/CNPJ: (\d+)/)?.[1] ?? null;
  }
  // Também verificar se cadastro foi criado nesta sessão
  const cadastroCriado = chatHistory.find(m => m.content.startsWith("[CADASTRO_CRIADO]"));
  if (cadastroCriado && !verifiedCpfCnpj) {
    verifiedCpfCnpj = cadastroCriado.content.match(/CPF\/CNPJ: (\d+)/)?.[1] ?? null;
  }

  // Verificar se bio já foi checada
  const bioChecked = chatHistory.some(m =>
    m.content.startsWith("[BIO_OK]") ||
    m.content.startsWith("[BIO_FALHOU]") ||
    m.content.startsWith("[BIO_INDISPONIVEL]")
  );

  // ── 2. Detectar CPF/CNPJ e verificar cadastro + biometria ─────────────────
  if (!verifiedCpfCnpj) {
    const cpfCnpj = extractCpfCnpj(message);
    if (cpfCnpj) {
      const [user] = await db
        .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, userType: usersTable.userType, isActive: usersTable.isActive, emailVerified: usersTable.emailVerified })
        .from(usersTable)
        .where(and(eq(usersTable.cpfCnpj, cpfCnpj), eq(usersTable.isActive, true)))
        .limit(1);

      let sysMsg: string;
      if (user && user.emailVerified) {
        const tipo = String(user.role) === "admin" ? "administrador" : user.userType ?? "cliente";
        sysMsg = `[USUARIO_VERIFICADO] CPF/CNPJ: ${cpfCnpj} | Nome: ${user.name} | Tipo: ${tipo} | ID_INTERNO: ${user.id}`;
        verifiedCpfCnpj = cpfCnpj;
      } else {
        sysMsg = `[USUARIO_NAO_CADASTRADO] CPF/CNPJ: ${cpfCnpj} — não encontrado no cadastro ativo. Colete os dados de cadastro conforme o fluxo.`;
      }

      await db.insert(chatMessages).values({ conversationId: sessionId, role: "user", content: sysMsg });
      chatHistory.push({ role: "user" as const, content: sysMsg });

      // Injeta catálogo se verificado
      if (verifiedCpfCnpj) {
        const certs = await db
          .select({ id: certificatesTable.id, name: certificatesTable.name, price: certificatesTable.price })
          .from(certificatesTable)
          .where(eq(certificatesTable.active, true));

        let catalogMsg: string;
        if (certs.length === 0) {
          catalogMsg = `[CATALOGO_VAZIO] Nenhum certificado disponível no momento. Informe ao cliente que o catálogo está temporariamente indisponível.`;
        } else {
          const lines = certs.map(c => `  - ID:${c.id} | ${c.name} — R$ ${parseFloat(c.price).toFixed(2)}`).join("\n");
          catalogMsg = `[CATALOGO_PRECOS] Catálogo oficial:\n${lines}\nUse SOMENTE estes IDs e valores.`;
        }

        await db.insert(chatMessages).values({ conversationId: sessionId, role: "user", content: catalogMsg });
        chatHistory.push({ role: "user" as const, content: catalogMsg });
      }

    }
  }

  // ── 3. Consulta de status de pedido ───────────────────────────────────────
  if (verifiedCpfCnpj) {
    const orderRef = extractOrderRef(message);
    if (orderRef.orderNumber || orderRef.orderId) {
      try {
        const conditions = [eq(ordersTable.customerCpfCnpj, verifiedCpfCnpj)];
        if (orderRef.orderNumber) conditions.push(eq(ordersTable.orderNumber, orderRef.orderNumber));
        else if (orderRef.orderId) conditions.push(eq(ordersTable.id, orderRef.orderId));

        const [order] = await db
          .select({ id: ordersTable.id, orderNumber: ordersTable.orderNumber, status: ordersTable.status, total: ordersTable.total, createdAt: ordersTable.createdAt, certificateId: ordersTable.certificateId })
          .from(ordersTable)
          .where(and(...conditions))
          .limit(1);

        let statusMsg: string;
        if (order) {
          const certName = (await db.select({ name: certificatesTable.name }).from(certificatesTable).where(eq(certificatesTable.id, order.certificateId)).limit(1))[0]?.name ?? "—";
          const statusLabel = STATUS_LABELS[order.status] ?? order.status;
          const dataStr = new Date(order.createdAt).toLocaleDateString("pt-BR");
          statusMsg = `[STATUS_PEDIDO] Pedido #${order.orderNumber} | Produto: ${certName} | Status: ${statusLabel} | Total: R$ ${parseFloat(order.total).toFixed(2)} | Data: ${dataStr}`;
        } else {
          statusMsg = `[PEDIDO_NAO_ENCONTRADO] Nenhum pedido encontrado com esses dados para o CPF/CNPJ verificado.`;
        }

        await db.insert(chatMessages).values({ conversationId: sessionId, role: "user", content: statusMsg });
        chatHistory.push({ role: "user" as const, content: statusMsg });
      } catch (orderErr) {
        logger.warn({ err: orderErr }, "chat: falha ao consultar pedido");
      }
    }
  }

  // ── 4. Auto-lookup de CEP ──────────────────────────────────────────────────
  const cepDigits = message.replace(/\D/g, "");
  const cepMatch = cepDigits.match(/^(\d{8})$/) ?? message.replace(/\s/g, "").match(/\b(\d{8})\b/);
  if (cepMatch) {
    const cep = (cepMatch[1] ?? cepMatch[0]).replace(/\D/g, "");
    try {
      const cepRes = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (cepRes.ok) {
        const cepData = await cepRes.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
        if (!cepData.erro && cepData.localidade) {
          const addressNote = `[CEP consultado automaticamente] CEP ${cep}: ${cepData.logradouro ?? ""}, bairro ${cepData.bairro ?? ""}, ${cepData.localidade}-${cepData.uf}. Use estes dados para preencher o endereço. Pergunte só o número e complemento.`;
          chatHistory.push({ role: "user" as const, content: `[Sistema] ${addressNote}` });
        }
      }
    } catch (cepErr) {
      logger.warn({ err: cepErr }, "CEP lookup failed");
    }
  }

  // ── 5. Carregar configurações de IA ───────────────────────────────────────
  const systemPrompt = buildSystemPrompt();

  const [aiSettings] = await db.select({
    aiProvider: settingsTable.aiProvider,
    openaiApiKey: settingsTable.openaiApiKey,
    openaiModel: settingsTable.openaiModel,
    deepseekApiKey: settingsTable.deepseekApiKey,
    deepseekModel: settingsTable.deepseekModel,
    claudeApiKey: settingsTable.claudeApiKey,
    claudeModel: settingsTable.claudeModel,
  }).from(settingsTable).limit(1);

  const provider = aiSettings?.aiProvider || "openai";
  const providerKey = ({
    openai: aiSettings?.openaiApiKey || "",
    deepseek: aiSettings?.deepseekApiKey || "",
    claude: aiSettings?.claudeApiKey || "",
  } as Record<string, string>)[provider] ?? "";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  if (!providerKey) {
    const names: Record<string, string> = { openai: "OpenAI", deepseek: "DeepSeek", claude: "Claude (Anthropic)" };
    res.write(`data: ${JSON.stringify({ content: `⚠️ Assistente não configurado. Configure a chave ${names[provider] ?? provider} no painel Configurações → IA.` })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  // ── 6. Chamar a IA ────────────────────────────────────────────────────────
  let fullResponse = "";

  const aiMessages = chatHistory
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

  if (provider === "claude") {
    const anthropic = new Anthropic({ apiKey: providerKey });
    const claudeModel = aiSettings?.claudeModel || "claude-3-5-haiku-20241022";
    try {
      const stream = anthropic.messages.stream({
        model: claudeModel,
        max_tokens: 1024,
        system: systemPrompt,
        messages: aiMessages,
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const content = event.delta.text;
          if (content) { fullResponse += content; res.write(`data: ${JSON.stringify({ content })}\n\n`); }
        }
      }
    } catch (claudeErr) {
      logger.error({ err: claudeErr }, "Claude streaming error");
      res.write(`data: ${JSON.stringify({ content: "\n\n⚠️ Erro ao conectar ao Claude. Verifique a chave de API." })}\n\n`);
    }
  } else {
    const baseURL = provider === "deepseek" ? "https://api.deepseek.com" : undefined;
    const model = provider === "deepseek"
      ? (aiSettings?.deepseekModel || "deepseek-chat")
      : (aiSettings?.openaiModel || "gpt-4o-mini");
    const openai = new OpenAI({ apiKey: providerKey, ...(baseURL ? { baseURL } : {}) });
    try {
      const stream = await openai.chat.completions.create({
        model,
        max_completion_tokens: 1024,
        messages: [{ role: "system", content: systemPrompt }, ...aiMessages],
        stream: true,
      });
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) { fullResponse += content; res.write(`data: ${JSON.stringify({ content })}\n\n`); }
      }
    } catch (openaiErr) {
      logger.error({ err: openaiErr }, "OpenAI/DeepSeek streaming error");
      res.write(`data: ${JSON.stringify({ content: "\n\n⚠️ Erro ao conectar à IA. Verifique a chave de API." })}\n\n`);
    }
  }

  await db.insert(chatMessages).values({ conversationId: sessionId, role: "assistant", content: fullResponse });

  // ── Helper: dispara segunda chamada ao AI no mesmo stream SSE ────────────
  async function streamFollowUp(extraMessages: { role: "user" | "assistant"; content: string }[]) {
    const followMsgs = [
      ...aiMessages,
      { role: "assistant" as const, content: fullResponse },
      ...extraMessages,
    ];
    let followText = "";
    if (provider === "claude") {
      const anthropic = new Anthropic({ apiKey: providerKey });
      const claudeModel = aiSettings?.claudeModel || "claude-3-5-haiku-20241022";
      try {
        const stream = anthropic.messages.stream({
          model: claudeModel, max_tokens: 1024, system: systemPrompt, messages: followMsgs,
        });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const c = event.delta.text;
            if (c) { followText += c; res.write(`data: ${JSON.stringify({ content: c })}\n\n`); }
          }
        }
      } catch (e) { logger.error({ err: e }, "streamFollowUp claude error"); }
    } else {
      const baseURL = provider === "deepseek" ? "https://api.deepseek.com" : undefined;
      const model = provider === "deepseek" ? (aiSettings?.deepseekModel || "deepseek-chat") : (aiSettings?.openaiModel || "gpt-4o-mini");
      const openai = new OpenAI({ apiKey: providerKey, ...(baseURL ? { baseURL } : {}) });
      try {
        const stream = await openai.chat.completions.create({
          model, max_completion_tokens: 1024,
          messages: [{ role: "system", content: systemPrompt }, ...followMsgs],
          stream: true,
        });
        for await (const chunk of stream) {
          const c = chunk.choices[0]?.delta?.content;
          if (c) { followText += c; res.write(`data: ${JSON.stringify({ content: c })}\n\n`); }
        }
      } catch (e) { logger.error({ err: e }, "streamFollowUp openai error"); }
    }
    if (followText) {
      await db.insert(chatMessages).values({ conversationId: sessionId, role: "assistant", content: followText });
    }
  }

  // ── 7. Processar ações da IA ───────────────────────────────────────────────

  // Ação: solicitar documentos
  if (fullResponse.includes("ACAO:SOLICITAR_DOCS:")) {
    const match = fullResponse.match(/ACAO:SOLICITAR_DOCS:\{"tipo":"(cpf|cnpj)"\}/);
    if (match) res.write(`data: ${JSON.stringify({ action: "solicitar_docs", tipo: match[1] })}\n\n`);
  }

  // Ação: criar pedido
  if (fullResponse.includes("ACAO:CRIAR_PEDIDO:")) {
    // Guard: evita pedido duplicado na mesma sessão
    const hasPedidoCriado = chatHistory.some(m => m.content.startsWith("[PEDIDO_CRIADO]"));
    if (hasPedidoCriado) {
      res.write(`data: ${JSON.stringify({ content: "\n\n⚠️ Já existe um pedido criado nesta sessão. Para adquirir outro certificado, inicie uma nova conversa." })}\n\n`);
    } else if (!verifiedCpfCnpj) {
      res.write(`data: ${JSON.stringify({ content: "\n\n❌ Não é possível criar pedidos sem validação de cadastro. Informe seu CPF ou CNPJ para continuar." })}\n\n`);
    } else {
      try {
        const jsonStr = fullResponse.split("ACAO:CRIAR_PEDIDO:")[1].trim();
        const orderData = JSON.parse(jsonStr) as {
          certificateId: number;
          clientType: "cpf" | "cnpj";
          customerName: string;
          customerCpfCnpj: string;
          customerBirthDate?: string | null;
          customerEmail: string;
          customerPhone?: string;
          companyName?: string;
          addressZipcode?: string;
          addressStreet?: string;
          addressNumber?: string;
          addressComplement?: string | null;
          addressNeighborhood?: string;
          addressCity?: string;
          addressState?: string;
          extendedWarranty: boolean;
          customerCei?: string | null;
          customerNis?: string | null;
          representanteCpf?: string | null;
          representanteNascimento?: string | null;
          representanteDocTipo?: string | null;
          representanteDocNumero?: string | null;
          representanteDocEmissor?: string | null;
          representanteAddressZipcode?: string | null;
          representanteAddressStreet?: string | null;
          representanteAddressNumber?: string | null;
          representanteAddressComplement?: string | null;
          representanteAddressNeighborhood?: string | null;
          representanteAddressCity?: string | null;
          representanteAddressState?: string | null;
        };

        const certIdNum = typeof orderData.certificateId === "string"
          ? parseInt(orderData.certificateId as string, 10)
          : orderData.certificateId;

        let cert = certIdNum && !isNaN(certIdNum)
          ? (await db.select().from(certificatesTable).where(eq(certificatesTable.id, certIdNum)).limit(1))[0]
          : undefined;

        if (!cert && typeof orderData.certificateId === "string") {
          const nameLike = (orderData.certificateId as string).toLowerCase().replace(/-/g, " ");
          const allCerts = await db.select().from(certificatesTable).where(eq(certificatesTable.active, true));
          cert = allCerts.find(c => c.name.toLowerCase().includes(nameLike));
        }

        if (!cert) throw new Error("Certificado não encontrado");

        const basePrice = parseFloat(cert.price);
        const total = basePrice + (orderData.extendedWarranty ? 15.0 : 0.0);

        let userId = 1;
        const [existingUser] = await db.select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.cpfCnpj, verifiedCpfCnpj))
          .limit(1);
        if (existingUser) userId = existingUser.id;

        const allMsgs = await db.select().from(chatMessages)
          .where(eq(chatMessages.conversationId, sessionId))
          .orderBy(asc(chatMessages.createdAt));
        // Merge all DOC_KEYS messages so uploads from different steps (cpf/cnpj + outros) are all kept
        const allDocKeyMsgs = allMsgs.filter(m => m.content.startsWith("[DOC_KEYS]"));
        const mergedDocKeys = allDocKeyMsgs.flatMap(m => {
          try { return JSON.parse(m.content.replace("[DOC_KEYS] ", "").trim()) as unknown[]; } catch { return []; }
        });
        const chatDocuments = mergedDocKeys.length > 0 ? JSON.stringify(mergedDocKeys) : null;

        let orderNumber: string;
        while (true) {
          const rand = Math.floor(1000 + Math.random() * 9000);
          orderNumber = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${rand}`;
          const [existing] = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.orderNumber, orderNumber)).limit(1);
          if (!existing) break;
        }

        const repCpf = orderData.representanteCpf ? orderData.representanteCpf.replace(/\D/g, "") || null : null;
        const repDocTipo = orderData.representanteDocTipo ? String(orderData.representanteDocTipo).replace(/\D/g, "") || null : null;

        const [order] = await db.insert(ordersTable).values({
          orderNumber,
          userId,
          certificateId: cert.id,
          status: "pending_payment",
          total: String(total),
          clientType: orderData.clientType,
          customerName: orderData.customerName,
          customerCpfCnpj: orderData.customerCpfCnpj.replace(/\D/g, ""),
          customerBirthDate: orderData.customerBirthDate || null,
          customerEmail: orderData.customerEmail || null,
          customerPhone: orderData.customerPhone || null,
          companyName: orderData.companyName || null,
          addressZipcode: orderData.addressZipcode || null,
          addressStreet: orderData.addressStreet || null,
          addressNumber: orderData.addressNumber || null,
          addressComplement: orderData.addressComplement || null,
          addressNeighborhood: orderData.addressNeighborhood || null,
          addressCity: orderData.addressCity || null,
          addressState: orderData.addressState || null,
          extendedWarranty: orderData.extendedWarranty,
          chatDocuments,
          customerCei: orderData.customerCei || null,
          customerNis: orderData.customerNis || null,
          representanteCpf: repCpf,
          representanteNascimento: orderData.representanteNascimento || null,
          representanteDocTipo: repDocTipo,
          representanteDocNumero: orderData.representanteDocNumero || null,
          representanteDocEmissor: orderData.representanteDocEmissor || null,
          representanteAddressZipcode: orderData.representanteAddressZipcode || null,
          representanteAddressStreet: orderData.representanteAddressStreet || null,
          representanteAddressNumber: orderData.representanteAddressNumber || null,
          representanteAddressComplement: orderData.representanteAddressComplement || null,
          representanteAddressNeighborhood: orderData.representanteAddressNeighborhood || null,
          representanteAddressCity: orderData.representanteAddressCity || null,
          representanteAddressState: orderData.representanteAddressState || null,
        }).returning();

        // Gerar QR Code PIX
        const [settings] = await db.select().from(settingsTable).limit(1);
        const pixKey = (settings as Record<string, unknown>)["pixKey"] as string | null
          ?? (settings as Record<string, unknown>)["mpPixKey"] as string | null
          ?? null;
        const appName = settings?.appName ?? "LealCert";
        const contactCity = (settings as Record<string, unknown>)["contactCity"] as string | null ?? "SAO PAULO";

        let qrCodeDataUrl: string | null = null;
        let pixPayload: string | null = null;

        if (pixKey) {
          try {
            pixPayload = buildPixPayload(pixKey, total, order.orderNumber, appName, contactCity);
            qrCodeDataUrl = await QRCode.toDataURL(pixPayload, {
              width: 300,
              margin: 2,
              color: { dark: "#000000", light: "#ffffff" },
            });
          } catch (qrErr) {
            logger.warn({ err: qrErr }, "QR Code generation failed");
          }
        }

        const confirmMsg = qrCodeDataUrl
          ? `✅ **Pedido #${order.orderNumber} criado!**\n\nTotal: **R$ ${total.toFixed(2)}**\n\nO QR Code PIX foi gerado na tela. Após o pagamento, entre em contato para agendar a videoconferência.\n\n📧 Confirmação enviada para **${orderData.customerEmail}**.`
          : pixKey
            ? `✅ **Pedido #${order.orderNumber} criado!**\n\nTotal: **R$ ${total.toFixed(2)}**\n\n**Chave PIX:** \`${pixKey}\`\nValor: R$ ${total.toFixed(2)}\n\nApós o pagamento, entre em contato para agendar a videoconferência.\n\n📧 Confirmação enviada para **${orderData.customerEmail}**.`
            : `✅ **Pedido #${order.orderNumber} criado!**\n\nTotal: **R$ ${total.toFixed(2)}**\n\nNossa equipe enviará os dados de pagamento para **${orderData.customerEmail}** em breve.`;

        res.write(`data: ${JSON.stringify({ content: "\n\n" })}\n\n`);
        res.write(`data: ${JSON.stringify({ content: confirmMsg })}\n\n`);
        res.write(`data: ${JSON.stringify({
          action: "order_created",
          orderId: order.id,
          orderNumber: order.orderNumber,
          total,
          pixKey: pixKey ?? null,
          pixPayload,
          qrCodeDataUrl,
        })}\n\n`);

        await db.insert(chatMessages).values({ conversationId: sessionId, role: "assistant", content: confirmMsg });

        // Inject [PEDIDO_CRIADO] so the AI and guard can detect duplicate attempts
        await db.insert(chatMessages).values({
          conversationId: sessionId,
          role: "system",
          content: `[PEDIDO_CRIADO] orderId:${order.id} orderNumber:${order.orderNumber} clientType:${orderData.clientType} total:${total.toFixed(2)}`,
        });

        if (orderData.customerEmail) {
          try {
            await sendOrderStatusEmail({
              to: orderData.customerEmail,
              customerName: orderData.customerName,
              orderNumber: order.orderNumber,
              status: "pending_payment",
              total,
              certName: cert.name,
            });
          } catch (emailErr) {
            logger.warn({ err: emailErr }, "Failed to send order confirmation email from chat");
          }
        }
      } catch (actionErr) {
        logger.error({ err: actionErr }, "Failed to process CRIAR_PEDIDO action");
        res.write(`data: ${JSON.stringify({ content: "\n\n❌ Erro ao criar o pedido. Tente novamente ou entre em contato com o suporte." })}\n\n`);
      }
    }
  }

  // Ação: verificar biometria PSBio
  if (fullResponse.includes("ACAO:VERIFICAR_BIO:")) {
    try {
      const rawAfter = fullResponse.split("ACAO:VERIFICAR_BIO:")[1].trim();
      const jsonMatch = rawAfter.match(/^\{[\s\S]*?\}/);
      if (!jsonMatch) throw new Error("Formato inválido na ação VERIFICAR_BIO — JSON não encontrado");
      const bioData = JSON.parse(jsonMatch[0]) as { cpf: string; dataNascimento?: string };
      const cpfDigits = String(bioData.cpf ?? "").replace(/\D/g, "").slice(0, 11);
      if (!cpfDigits || cpfDigits.length !== 11) throw new Error("CPF inválido para verificação PSBio");

      const dataNascimento = bioData.dataNascimento?.trim() || undefined;
      let bioMsg: string;
      const sw = await getSwSettings();
      if (!sw) {
        bioMsg = `[BIO_INDISPONIVEL] Sistema PSBio indisponível no momento — Safeweb não configurada. Tente novamente mais tarde.`;
      } else {
        logger.info({ psbioUrl: sw.url, psbioUser: sw.username, cpf: cpfDigits, dataNascimento }, "PSBio global chamando");
        const bioResult = await swBiometriaPSBioGlobal(sw, cpfDigits, dataNascimento);
        logger.info({ cpf: cpfDigits, dataNascimento, bioResult }, "PSBio global raw response");
        const isTruthy = (v: unknown) => v === true || v === "true" || v === 1 || v === "sim" || v === "S" || v === "s";
        const encontrado = isTruthy(bioResult.encontrado)
          || isTruthy(bioResult.Encontrado)
          || isTruthy(bioResult.resultado)
          || isTruthy(bioResult.Resultado)
          || isTruthy(bioResult.biometria)
          || isTruthy(bioResult.Biometria)
          || bioResult.status === "encontrado" || bioResult.status === "ENCONTRADO" || bioResult.status === "Encontrado"
          || bioResult.Status === "encontrado" || bioResult.Status === "ENCONTRADO" || bioResult.Status === "Encontrado"
          || bioResult.statusCode === 200;
        if (encontrado) {
          bioMsg = `[BIO_OK] Biometria PSBio encontrada para CPF ${cpfDigits}. Pode prosseguir com a emissão por videoconferência.`;
        } else {
          bioMsg = `[BIO_FALHOU] Biometria PSBio NÃO encontrada para CPF ${cpfDigits}. Retorno API: ${JSON.stringify(bioResult)}. NÃO prossiga com venda — oriente o cliente a abrir um chamado de suporte.`;
        }
      }

      await db.insert(chatMessages).values({ conversationId: sessionId, role: "user", content: bioMsg });
      const bioLabel = bioMsg.startsWith("[BIO_OK]")
        ? "✅ Biometria encontrada! Podemos prosseguir."
        : bioMsg.startsWith("[BIO_FALHOU]")
          ? "❌ Biometria não encontrada no sistema PSBio nacional."
          : "⚠️ Sistema PSBio indisponível no momento.";
      res.write(`data: ${JSON.stringify({ content: "\n\n" + bioLabel })}\n\n`);
      // Continua automaticamente: AI responde ao resultado da biometria
      await streamFollowUp([{ role: "user", content: bioMsg }]);
    } catch (bioActionErr) {
      logger.error({ err: bioActionErr }, "Failed to process VERIFICAR_BIO action");
      res.write(`data: ${JSON.stringify({ content: "\n\n❌ Erro ao verificar biometria: " + ((bioActionErr as Error).message ?? "falha inesperada") })}\n\n`);
    }
  }

  // Ação: criar cadastro
  if (fullResponse.includes("ACAO:CRIAR_CADASTRO:")) {
    try {
      const jsonStr = fullResponse.split("ACAO:CRIAR_CADASTRO:")[1].trim();
      const cadastroData = JSON.parse(jsonStr) as {
        userType: "cliente" | "contador";
        personType: "fisica" | "juridica";
        name: string;
        cpfCnpj: string;
        email: string;
        phone?: string;
        zipCode?: string;
        street?: string;
        addressNumber?: string;
        complement?: string;
        neighborhood?: string;
        city?: string;
        addressState?: string;
        companyName?: string;
        companyFantasyName?: string;
        responsibleCpf?: string;
        responsibleName?: string;
        crcNumber?: string;
      };

      const cpfCnpjDigits = String(cadastroData.cpfCnpj ?? "").replace(/\D/g, "");
      if (!cpfCnpjDigits || !cadastroData.name || !cadastroData.email) {
        throw new Error("Dados incompletos: nome, CPF/CNPJ e e-mail são obrigatórios");
      }

      // Verificar se já existe
      const [existing] = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.cpfCnpj, cpfCnpjDigits))
        .limit(1);
      if (existing) {
        throw new Error(`CPF/CNPJ ${cpfCnpjDigits} já possui cadastro`);
      }

      const provisionalPassword = generateProvisionalPassword();
      const passwordHash = await bcrypt.hash(provisionalPassword, 10);

      const [newUser] = await db.insert(usersTable).values({
        name: cadastroData.name.trim(),
        cpfCnpj: cpfCnpjDigits,
        email: cadastroData.email.trim().toLowerCase(),
        passwordHash,
        role: "contador" as const,
        userType: cadastroData.userType,
        personType: cadastroData.personType,
        phone: cadastroData.phone ? cadastroData.phone.replace(/\D/g, "") : null,
        zipCode: cadastroData.zipCode ? cadastroData.zipCode.replace(/\D/g, "") : null,
        street: cadastroData.street || null,
        addressNumber: cadastroData.addressNumber || null,
        complement: cadastroData.complement || null,
        neighborhood: cadastroData.neighborhood || null,
        city: cadastroData.city || null,
        addressState: cadastroData.addressState || null,
        companyName: cadastroData.companyName || null,
        companyFantasyName: cadastroData.companyFantasyName || null,
        responsibleCpf: cadastroData.responsibleCpf ? cadastroData.responsibleCpf.replace(/\D/g, "") : null,
        responsibleName: cadastroData.responsibleName || null,
        crcNumber: cadastroData.crcNumber || null,
        isActive: true,
        emailVerified: true,
        mustChangePassword: true,
      }).returning();

      // Enviar e-mail com senha provisória
      try {
        await sendTempPasswordEmail(cadastroData.email, cadastroData.name, provisionalPassword);
      } catch (emailErr) {
        logger.warn({ err: emailErr }, "Failed to send provisional password email");
      }

      // Injetar [CADASTRO_CRIADO] + [USUARIO_VERIFICADO] + catálogo no histórico
      const tipo = cadastroData.userType;
      const cadastroMsg = `[CADASTRO_CRIADO] CPF/CNPJ: ${cpfCnpjDigits} | Nome: ${newUser.name} | Tipo: ${tipo} | ID_INTERNO: ${newUser.id} — Uma senha provisória foi enviada por e-mail. O cliente deverá alterar a senha no primeiro acesso.`;
      const verificadoMsg = `[USUARIO_VERIFICADO] CPF/CNPJ: ${cpfCnpjDigits} | Nome: ${newUser.name} | Tipo: ${tipo} | ID_INTERNO: ${newUser.id}`;

      await db.insert(chatMessages).values({ conversationId: sessionId, role: "user", content: cadastroMsg });
      await db.insert(chatMessages).values({ conversationId: sessionId, role: "user", content: verificadoMsg });

      // Injetar catálogo
      const certs = await db
        .select({ id: certificatesTable.id, name: certificatesTable.name, price: certificatesTable.price })
        .from(certificatesTable)
        .where(eq(certificatesTable.active, true));

      let catalogMsg: string;
      if (certs.length === 0) {
        catalogMsg = `[CATALOGO_VAZIO] Nenhum certificado disponível no momento.`;
      } else {
        const lines = certs.map(c => `  - ID:${c.id} | ${c.name} — R$ ${parseFloat(c.price).toFixed(2)}`).join("\n");
        catalogMsg = `[CATALOGO_PRECOS] Catálogo oficial:\n${lines}\nUse SOMENTE estes IDs e valores.`;
      }
      await db.insert(chatMessages).values({ conversationId: sessionId, role: "user", content: catalogMsg });

      const confirmMsg = `✅ **Cadastro criado com sucesso!**\n\nOlá, **${newUser.name}**! Seu cadastro foi criado.\n\n📧 Uma senha provisória foi enviada para **${cadastroData.email}**. Você deverá alterá-la no primeiro acesso ao painel.\n\nAgora vou te ajudar a escolher e adquirir seu certificado digital! 😊`;

      res.write(`data: ${JSON.stringify({ content: "\n\n" })}\n\n`);
      res.write(`data: ${JSON.stringify({ content: confirmMsg })}\n\n`);
      res.write(`data: ${JSON.stringify({ action: "cadastro_criado", userId: newUser.id, cpfCnpj: cpfCnpjDigits })}\n\n`);
      await db.insert(chatMessages).values({ conversationId: sessionId, role: "assistant", content: confirmMsg });

    } catch (cadastroErr) {
      logger.error({ err: cadastroErr }, "Failed to process CRIAR_CADASTRO action");
      const errMsg = (cadastroErr as Error).message ?? "Erro ao criar cadastro";
      res.write(`data: ${JSON.stringify({ content: `\n\n❌ Não foi possível criar o cadastro: ${errMsg}. Verifique os dados e tente novamente.` })}\n\n`);
    }
  }

  // Ação: validar representante CNPJ via Receita Federal (Safeweb)
  if (fullResponse.includes("ACAO:VALIDAR_CNPJ_RFB:")) {
    try {
      const rawAfterRfb = fullResponse.split("ACAO:VALIDAR_CNPJ_RFB:")[1].trim();
      const jsonMatchRfb = rawAfterRfb.match(/^\{[\s\S]*?\}/);
      if (!jsonMatchRfb) throw new Error("Formato inválido na ação VALIDAR_CNPJ_RFB");
      const rfbData = JSON.parse(jsonMatchRfb[0]) as { cnpj: string; cpf: string; dataNascimento: string };
      const cnpjDigits = String(rfbData.cnpj ?? "").replace(/\D/g, "");
      const cpfDigits = String(rfbData.cpf ?? "").replace(/\D/g, "");
      const dataNasc = String(rfbData.dataNascimento ?? "").trim();
      if (!cnpjDigits || cnpjDigits.length !== 14 || !cpfDigits || cpfDigits.length !== 11 || !dataNasc) {
        throw new Error("CNPJ (14 dígitos), CPF (11 dígitos) e data de nascimento são obrigatórios");
      }
      const sw = await getSwSettings();
      let injMsg: string;
      if (!sw) {
        injMsg = `[CNPJ_RFB_INDISPONIVEL] Sistema Safeweb não configurado. Prossiga sem a validação automática.`;
      } else {
        const result = await swConsultaCNPJ(sw, cnpjDigits, cpfDigits, dataNasc);
        logger.info({ cnpj: cnpjDigits, cpf: cpfDigits, result }, "swConsultaCNPJ raw response");
        if (result.Codigo === 0) {
          const nomeCompleto = typeof result.NomeCompleto === "string" ? result.NomeCompleto.trim() : "";
          const mensagem = typeof result.Mensagem === "string" ? result.Mensagem.trim() : "";
          const razaoSocial = nomeCompleto || mensagem || "Empresa";
          const repName = mensagem || nomeCompleto || "";
          injMsg = `[CNPJ_RESPONSAVEL_OK:{"razaoSocial":"${razaoSocial}","repName":"${repName}","cnpj":"${cnpjDigits}","cpf":"${cpfDigits}"}]`;
        } else {
          const msgErr = typeof result.Mensagem === "string" ? result.Mensagem : "CPF do responsável não confere com a Receita Federal.";
          injMsg = `[CNPJ_RESPONSAVEL_INVALIDO:{"mensagem":"${msgErr}","codigo":${result.Codigo ?? -1}}]`;
        }
      }
      await db.insert(chatMessages).values({ conversationId: sessionId, role: "system", content: injMsg });
      await streamFollowUp([{ role: "user" as const, content: injMsg }]);
    } catch (rfbErr) {
      logger.error({ err: rfbErr }, "Failed to process VALIDAR_CNPJ_RFB action");
      const errMsg = (rfbErr as Error).message ?? "Erro ao validar CNPJ";
      res.write(`data: ${JSON.stringify({ content: `\n\n❌ ${errMsg}` })}\n\n`);
    }
  }

  // Ação: verificar pagamento
  if (fullResponse.includes("ACAO:VERIFICAR_PAGAMENTO:")) {
    try {
      const rawAfterVp = fullResponse.split("ACAO:VERIFICAR_PAGAMENTO:")[1].trim();
      const jsonMatchVp = rawAfterVp.match(/^\{[\s\S]*?\}/);
      if (!jsonMatchVp) throw new Error("Formato inválido na ação VERIFICAR_PAGAMENTO");
      const { orderId: vpOrderId } = JSON.parse(jsonMatchVp[0]) as { orderId: number };
      const [orderRow] = await db.select({
        id: ordersTable.id, orderNumber: ordersTable.orderNumber,
        status: ordersTable.status, garPedido: ordersTable.garPedido,
        safewebSolicitacaoId: ordersTable.safewebSolicitacaoId,
      }).from(ordersTable).where(eq(ordersTable.id, vpOrderId)).limit(1);

      const paidStatuses = ["paid", "protocol_assigned", "aguardando_validacao", "emitido", "completed"];
      if (!orderRow || !paidStatuses.includes(orderRow.status)) {
        const injMsg = `[PAGAMENTO_PENDENTE] orderId:${vpOrderId}`;
        await db.insert(chatMessages).values({ conversationId: sessionId, role: "system", content: injMsg });
        await streamFollowUp([{ role: "user" as const, content: injMsg }]);
      } else {
        const protocolo = orderRow.garPedido ?? orderRow.safewebSolicitacaoId ?? orderRow.orderNumber;
        const injMsg = `[PAGAMENTO_CONFIRMADO:{"protocolo":"${protocolo}","orderId":${vpOrderId}}]`;
        await db.insert(chatMessages).values({ conversationId: sessionId, role: "system", content: injMsg });
        res.write(`data: ${JSON.stringify({ action: "payment_confirmed", protocolo, orderId: vpOrderId })}\n\n`);
        await streamFollowUp([{ role: "user" as const, content: injMsg }]);
      }
    } catch (vpErr) {
      logger.error({ err: vpErr }, "Failed to process VERIFICAR_PAGAMENTO action");
      res.write(`data: ${JSON.stringify({ content: "\n\n❌ Erro ao verificar pagamento. Tente novamente." })}\n\n`);
    }
  }

  // Ação: buscar horários disponíveis
  if (fullResponse.includes("ACAO:BUSCAR_HORARIOS:")) {
    try {
      const now = new Date();
      const slots = await db.select({ id: slotsTable.id, slotDatetime: slotsTable.slotDatetime })
        .from(slotsTable)
        .where(and(eq(slotsTable.active, true), gt(slotsTable.slotDatetime, now)))
        .orderBy(asc(slotsTable.slotDatetime))
        .limit(10);

      let injMsg: string;
      if (slots.length === 0) {
        injMsg = `[HORARIOS_INDISPONIVEIS] Nenhum horário disponível no momento.`;
      } else {
        const formatted = slots.map(s => {
          const d = new Date(s.slotDatetime);
          const pad = (n: number) => String(n).padStart(2, "0");
          const dataHora = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
          return { id: s.id, dataHora };
        });
        injMsg = `[HORARIOS_DISPONIVEIS:${JSON.stringify({ slots: formatted })}]`;
      }
      await db.insert(chatMessages).values({ conversationId: sessionId, role: "system", content: injMsg });
      await streamFollowUp([{ role: "user" as const, content: injMsg }]);
    } catch (bhErr) {
      logger.error({ err: bhErr }, "Failed to process BUSCAR_HORARIOS action");
      res.write(`data: ${JSON.stringify({ content: "\n\n❌ Erro ao buscar horários. Tente novamente." })}\n\n`);
    }
  }

  // Ação: agendar videoconferência
  if (fullResponse.includes("ACAO:AGENDAR:")) {
    try {
      const rawAfterAg = fullResponse.split("ACAO:AGENDAR:")[1].trim();
      const jsonMatchAg = rawAfterAg.match(/^\{[\s\S]*?\}/);
      if (!jsonMatchAg) throw new Error("Formato inválido na ação AGENDAR");
      const { orderId: agOrderId, slotId } = JSON.parse(jsonMatchAg[0]) as { orderId: number; slotId: number };

      const [slot] = await db.select().from(slotsTable)
        .where(and(eq(slotsTable.id, slotId), eq(slotsTable.active, true))).limit(1);
      if (!slot) throw new Error("Horário indisponível ou já reservado");

      // Reservar slot e salvar no pedido
      await db.update(slotsTable).set({ active: false }).where(eq(slotsTable.id, slotId));
      await db.update(ordersTable).set({ scheduledAt: slot.slotDatetime }).where(eq(ordersTable.id, agOrderId));

      const d = new Date(slot.slotDatetime);
      const pad = (n: number) => String(n).padStart(2, "0");
      const dataHora = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

      const injMsg = `[AGENDAMENTO_CONFIRMADO:{"dataHora":"${dataHora}","orderId":${agOrderId}}]`;
      await db.insert(chatMessages).values({ conversationId: sessionId, role: "system", content: injMsg });
      res.write(`data: ${JSON.stringify({ action: "agendamento_confirmado", dataHora, orderId: agOrderId })}\n\n`);
      await streamFollowUp([{ role: "user" as const, content: injMsg }]);
    } catch (agErr) {
      logger.error({ err: agErr }, "Failed to process AGENDAR action");
      const msg = (agErr as Error).message ?? "Erro ao agendar";
      res.write(`data: ${JSON.stringify({ content: `\n\n❌ ${msg}. Tente outro horário ou entre em contato com o suporte.` })}\n\n`);
    }
  }

  // Ação: criar chamado de suporte
  if (fullResponse.includes("ACAO:CRIAR_CHAMADO:")) {
    try {
      const jsonStr = fullResponse.split("ACAO:CRIAR_CHAMADO:")[1].trim();
      const ticketData = JSON.parse(jsonStr) as {
        subject: string;
        message: string;
        guestName?: string;
        guestContact?: string;
      };

      if (!ticketData.subject || !ticketData.message) throw new Error("subject e message obrigatórios");

      let ticketUserId: number;
      let subjectPrefix = "";
      let messagePrefix = "";

      if (verifiedCpfCnpj) {
        const [u] = await db.select({ id: usersTable.id }).from(usersTable)
          .where(eq(usersTable.cpfCnpj, verifiedCpfCnpj)).limit(1);
        if (!u) throw new Error("Usuário verificado não encontrado");
        ticketUserId = u.id;
      } else {
        const [adminUser] = await db.select({ id: usersTable.id }).from(usersTable)
          .where(eq(usersTable.role, "admin")).limit(1);
        if (!adminUser) throw new Error("Usuário sistema não encontrado");
        ticketUserId = adminUser.id;
        subjectPrefix = "[Via Chatbot] ";
        const name = ticketData.guestName ?? "Não informado";
        const contact = ticketData.guestContact ?? "Não informado";
        messagePrefix = `👤 **Abertura via chatbot**\nNome: ${name}\nContato: ${contact}\n\n`;
      }

      const [ticket] = await db.insert(ticketsTable).values({
        userId: ticketUserId,
        subject: `${subjectPrefix}${ticketData.subject}`,
      }).returning();

      await db.insert(messagesTable).values({
        ticketId: ticket.id,
        userId: ticketUserId,
        content: `${messagePrefix}${ticketData.message}`,
      });

      const confirmMsg = verifiedCpfCnpj
        ? `✅ **Chamado #${ticket.id} aberto com sucesso!**\n\nNossa equipe irá analisar e responderá em breve.\nAcompanhe em lealcert.com.br/suporte.`
        : `✅ **Chamado #${ticket.id} aberto com sucesso!**\n\nNossa equipe entrará em contato pelo canal informado em breve.`;

      res.write(`data: ${JSON.stringify({ content: "\n\n" })}\n\n`);
      res.write(`data: ${JSON.stringify({ content: confirmMsg })}\n\n`);
      res.write(`data: ${JSON.stringify({ action: "ticket_created", ticketId: ticket.id })}\n\n`);
      await db.insert(chatMessages).values({ conversationId: sessionId, role: "assistant", content: confirmMsg });
    } catch (ticketErr) {
      logger.error({ err: ticketErr }, "Failed to process CRIAR_CHAMADO action");
      res.write(`data: ${JSON.stringify({ content: "\n\n❌ Erro ao abrir o chamado. Tente novamente ou acesse lealcert.com.br/suporte." })}\n\n`);
    }
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
