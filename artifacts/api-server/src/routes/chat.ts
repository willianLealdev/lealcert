import { Router } from "express";
import { eq, asc, and, or } from "drizzle-orm";
import { db, conversations, chatMessages, certificatesTable, usersTable, ordersTable, settingsTable, ticketsTable, messagesTable } from "@workspace/db";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";
import { sendOrderStatusEmail } from "../lib/email";
import multer from "multer";
import path from "path";
import fs from "fs";

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

// ── Status traduzido para o cliente ───────────────────────────────────────────
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

// ── System prompt — SEM preços. O catálogo com valores só é injetado pelo
//    backend depois que [USUARIO_VERIFICADO] aparece na sessão. ──────────────
function buildSystemPrompt(): string {
  return `Você é a assistente virtual da LealCert, especializada em Certificados Digitais ICP-Brasil.

**Sobre a LealCert e a cadeia de certificação:**
- A LealCert é parceira comercial da AR Juntos, Autoridade de Registro credenciada ao ITI (Instituto Nacional de Tecnologia da Informação)
- A Autoridade Certificadora responsável pela emissão dos certificados é a AC SafeWeb
- A cadeia de confiança segue: ITI → AC SafeWeb → AR Juntos → LealCert (parceira comercial)
- Os certificados emitidos são 100% válidos e reconhecidos pela ICP-Brasil
- NÃO diga que a LealCert é uma AR — ela é parceira comercial de uma AR
- NÃO diga que a LealCert emite certificados diretamente — a emissão é feita pela AC SafeWeb via AR Juntos

════════════════════════════════════════════════════════════
⚠️  REGRA ABSOLUTA — NÃO NEGOCIÁVEL:
Você NÃO conhece os preços dos certificados. Os preços são fornecidos pelo sistema apenas após verificação de cadastro.
Portanto NUNCA invente, estime ou mencione qualquer valor monetário de certificados.

ANTES de qualquer informação de preço ou pedido:
1. Peça o CPF (11 dígitos) ou CNPJ (14 dígitos) do cliente/contador
2. O sistema verificará automaticamente o cadastro
3. Somente após [USUARIO_VERIFICADO] E [CATALOGO_PRECOS] aparecerem na conversa
   você estará autorizado a informar valores e processar pedidos — usando
   EXCLUSIVAMENTE os preços presentes em [CATALOGO_PRECOS], sem inventar nenhum outro
4. Se receber [USUARIO_NAO_CADASTRADO]: informe que pode abrir um chamado de suporte
   mesmo sem cadastro — pergunte nome e e-mail/telefone para contato
════════════════════════════════════════════════════════════

**Tipos de certificados que oferecemos** (sem valores — aguarde [CATALOGO_PRECOS]):
- e-CPF A1 (arquivo digital, para pessoa física)
- e-CPF A3 (token/cartão, para pessoa física)
- e-CNPJ A1 (arquivo digital, para pessoa jurídica)
- e-CNPJ A3 (token/cartão, para pessoa jurídica)
- Disponíveis em validades de 1, 2 ou 3 anos (conforme catálogo ativo)

**Consulta de status de pedido:**
- Peça o CPF/CNPJ e o número do pedido (ex: 20240101-1234) ou ID numérico
- O sistema injetará [STATUS_PEDIDO] com as informações ou [PEDIDO_NAO_ENCONTRADO]

**IMPORTANTE sobre A3:**
- Certificados A3 NÃO incluem mídia (cartão/token). O cliente precisa de leitor compatível.

**Normalização de dados:**
- CPF/CNPJ com espaços entre dígitos — remova tudo, use só os números
- CEP: use os dados de [CEP consultado automaticamente] quando disponíveis
- Telefone: apenas dígitos + DDD
- E-mail falado (ex: "joao arroba gmail ponto com") → reconstrua corretamente

**Fluxo após [USUARIO_VERIFICADO] + [CATALOGO_PRECOS]:**
1. Identifique o tipo de certificado adequado
2. Apresente o certificado com o preço EXATO do [CATALOGO_PRECOS]
3. Colete dados UM A UM:
   - Nome completo, CPF/CNPJ, E-mail, Telefone (WhatsApp), CEP
4. Pergunte sobre garantia estendida (+R$15,00)
5. Confirme todos os dados com o cliente
6. Solicite documentos na linha seguinte (sem linha em branco):
   - e-CPF: RG ou CNH (frente e verso) + Comprovante de residência
     ACAO:SOLICITAR_DOCS:{"tipo":"cpf"}
   - e-CNPJ: Cartão CNPJ + Contrato Social + RG/CNH do responsável + Comprovante de endereço
     ACAO:SOLICITAR_DOCS:{"tipo":"cnpj"}
7. Aguarde [DOCUMENTOS_ENVIADOS]
8. Emita ACAO:CRIAR_PEDIDO (somente para [USUARIO_VERIFICADO])

**Abertura de chamado de suporte (ACAO:CRIAR_CHAMADO):**
- Qualquer pessoa pode abrir um chamado — com ou sem cadastro
- Para clientes SEM cadastro ([USUARIO_NAO_CADASTRADO] ou CPF/CNPJ não informado):
  colete nome completo + e-mail ou telefone para contato + assunto + descrição do problema
- Para clientes COM cadastro ([USUARIO_VERIFICADO]):
  colete apenas assunto + descrição (dados já conhecidos)
- Quando tiver as informações, emita na linha seguinte (sem texto depois):
  COM cadastro: ACAO:CRIAR_CHAMADO:{"subject":"<assunto>","message":"<descricao detalhada>"}
  SEM cadastro: ACAO:CRIAR_CHAMADO:{"subject":"<assunto>","message":"<descricao detalhada>","guestName":"<nome>","guestContact":"<email ou telefone>"}

**Tom:** Amigável, direto, profissional. Português do Brasil.

Quando tiver todos os dados, confirmação E [DOCUMENTOS_ENVIADOS], responda EXATAMENTE neste formato:
ACAO:CRIAR_PEDIDO:{"certificateId":<numero_inteiro_do_ID_em_CATALOGO_PRECOS>,"clientType":"cpf|cnpj","customerName":"<nome>","customerCpfCnpj":"<apenas_digitos>","customerEmail":"<email>","customerPhone":"<apenas_digitos>","companyName":"<razao_social_ou_null>","addressZipcode":"<apenas_digitos>","addressStreet":"<rua>","addressNumber":"<numero>","addressNeighborhood":"<bairro>","addressCity":"<cidade>","addressState":"<uf>","extendedWarranty":<true|false>}`;
}

// ── Extrai sequência de 11 ou 14 dígitos de um texto ─────────────────────────
function extractCpfCnpj(text: string): string | null {
  // Remove non-digits and spaces between digits (voice input)
  const normalized = text.replace(/[^0-9]/g, "");
  // Prefer CNPJ (14 digits) then CPF (11 digits)
  const cnpj = normalized.match(/\d{14}/)?.[0];
  if (cnpj) return cnpj;
  const cpf = normalized.match(/\d{11}/)?.[0];
  return cpf ?? null;
}

// ── Extrai número do pedido do texto (formato YYYYMMDD-NNNN ou só dígitos) ───
function extractOrderRef(text: string): { orderNumber?: string; orderId?: number } {
  const orderNumberMatch = text.match(/\b(\d{8}-\d{4})\b/);
  if (orderNumberMatch) return { orderNumber: orderNumberMatch[1] };
  // "pedido 123" or "pedido #123"
  const idMatch = text.match(/\bpedido\s+#?(\d+)\b/i);
  if (idMatch) return { orderId: parseInt(idMatch[1], 10) };
  return {};
}

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
    .limit(40);

  const chatHistory = history.map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));

  // ── 1. Verificar se o usuário já está verificado nesta sessão ──────────────
  const verifiedMsg = chatHistory.find(m => m.content.startsWith("[USUARIO_VERIFICADO]"));
  let verifiedCpfCnpj: string | null = null;
  if (verifiedMsg) {
    verifiedCpfCnpj = verifiedMsg.content.match(/CPF\/CNPJ: (\d+)/)?.[1] ?? null;
  }

  // ── 2. Tentar verificar CPF/CNPJ da mensagem atual (se ainda não verificado) ─
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
        const tipo = user.role === "admin" ? "administrador" : user.userType ?? "cliente";
        sysMsg = `[USUARIO_VERIFICADO] CPF/CNPJ: ${cpfCnpj} | Nome: ${user.name} | Tipo: ${tipo} | ID_INTERNO: ${user.id}`;
        verifiedCpfCnpj = cpfCnpj;
      } else {
        sysMsg = `[USUARIO_NAO_CADASTRADO] CPF/CNPJ: ${cpfCnpj} — não encontrado no cadastro ou conta não confirmada. Oriente a acessar lealcert.com.br/register.`;
      }

      // Persiste no histórico para a sessão
      await db.insert(chatMessages).values({ conversationId: sessionId, role: "user", content: sysMsg });
      chatHistory.push({ role: "user" as const, content: sysMsg });

      // ── Se verificado, injeta catálogo com preços reais do banco ─────────
      if (verifiedCpfCnpj) {
        const certs = await db
          .select({ id: certificatesTable.id, name: certificatesTable.name, price: certificatesTable.price })
          .from(certificatesTable)
          .where(eq(certificatesTable.active, true));

        let catalogMsg: string;
        if (certs.length === 0) {
          catalogMsg = `[CATALOGO_VAZIO] Nenhum certificado está disponível para venda no momento. NÃO ofereça nenhum produto nem mencione preços. Informe ao cliente que o catálogo está temporariamente indisponível e que ele pode entrar em contato pelo suporte.`;
        } else {
          const catalogLines = certs
            .map(c => `  - ID:${c.id} | ${c.name} — R$ ${parseFloat(c.price).toFixed(2)}`)
            .join("\n");
          catalogMsg = `[CATALOGO_PRECOS] Catálogo oficial consultado agora do banco de dados:\n${catalogLines}\nUse SOMENTE estes IDs e valores — nunca invente preços.`;
        }

        await db.insert(chatMessages).values({ conversationId: sessionId, role: "user", content: catalogMsg });
        chatHistory.push({ role: "user" as const, content: catalogMsg });
      }
    }
  }

  // ── 3. Consulta de status de pedido (somente para usuário verificado) ──────
  if (verifiedCpfCnpj) {
    const orderRef = extractOrderRef(message);
    if (orderRef.orderNumber || orderRef.orderId) {
      try {
        const conditions = [eq(ordersTable.customerCpfCnpj, verifiedCpfCnpj)];
        if (orderRef.orderNumber) conditions.push(eq(ordersTable.orderNumber, orderRef.orderNumber));
        else if (orderRef.orderId) conditions.push(eq(ordersTable.id, orderRef.orderId));

        const [order] = await db
          .select({
            id: ordersTable.id,
            orderNumber: ordersTable.orderNumber,
            status: ordersTable.status,
            total: ordersTable.total,
            createdAt: ordersTable.createdAt,
            certificateId: ordersTable.certificateId,
          })
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
          const addressNote = `[CEP consultado automaticamente] CEP ${cep}: ${cepData.logradouro ?? ""}, bairro ${cepData.bairro ?? ""}, ${cepData.localidade}-${cepData.uf}. Use estes dados para preencher o endereço. Pergunte apenas o número.`;
          chatHistory.push({ role: "user" as const, content: `[Sistema] ${addressNote}` });
        }
      }
    } catch (cepErr) {
      logger.warn({ err: cepErr }, "CEP lookup failed");
    }
  }

  // ── 5. Carregar configurações de IA ───────────────────────────────────────
  // Preços NÃO vão no system prompt — são injetados via [CATALOGO_PRECOS] só após verificação
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

  // Filtra mensagens system do histórico para o formato da IA (Claude/OpenAI não aceitam role=system no meio)
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

  // ── 7. Processar ações emitidas pela IA ───────────────────────────────────

  // Ação: solicitar documentos
  if (fullResponse.includes("ACAO:SOLICITAR_DOCS:")) {
    const match = fullResponse.match(/ACAO:SOLICITAR_DOCS:\{"tipo":"(cpf|cnpj)"\}/);
    if (match) res.write(`data: ${JSON.stringify({ action: "solicitar_docs", tipo: match[1] })}\n\n`);
  }

  // Ação: criar pedido (somente se usuário verificado)
  if (fullResponse.includes("ACAO:CRIAR_PEDIDO:")) {
    if (!verifiedCpfCnpj) {
      // Segurança extra: bloqueia criação de pedido se não verificado
      res.write(`data: ${JSON.stringify({ content: "\n\n❌ Não é possível criar pedidos sem validação de cadastro. Informe seu CPF ou CNPJ para continuar." })}\n\n`);
    } else {
      try {
        const jsonStr = fullResponse.split("ACAO:CRIAR_PEDIDO:")[1].trim();
        const orderData = JSON.parse(jsonStr) as {
          certificateId: number;
          clientType: "cpf" | "cnpj";
          customerName: string;
          customerCpfCnpj: string;
          customerEmail: string;
          customerPhone?: string;
          companyName?: string;
          addressZipcode?: string;
          addressStreet?: string;
          addressNumber?: string;
          addressNeighborhood?: string;
          addressCity?: string;
          addressState?: string;
          extendedWarranty: boolean;
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
          cert = allCerts.find(c => c.name.toLowerCase().includes(nameLike) || nameLike.includes(c.name.toLowerCase().split(" ")[0]));
        }

        if (!cert) throw new Error("Certificado não encontrado");

        const basePrice = parseFloat(cert.price);
        const total = basePrice + (orderData.extendedWarranty ? 15.0 : 0.0);

        // Encontra o userId pelo CPF/CNPJ verificado na sessão
        let userId = 1;
        const [existingUser] = await db.select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.cpfCnpj, verifiedCpfCnpj))
          .limit(1);
        if (existingUser) userId = existingUser.id;

        // Busca documentos enviados no histórico
        const allMsgs = await db.select().from(chatMessages)
          .where(eq(chatMessages.conversationId, sessionId))
          .orderBy(asc(chatMessages.createdAt));
        const docKeyMsg = [...allMsgs].reverse().find(m => m.content.startsWith("[DOC_KEYS]"));
        const chatDocuments = docKeyMsg ? docKeyMsg.content.replace("[DOC_KEYS] ", "").trim() : null;

        let orderNumber: string;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const rand = Math.floor(1000 + Math.random() * 9000);
          orderNumber = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${rand}`;
          const [existing] = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.orderNumber, orderNumber)).limit(1);
          if (!existing) break;
        }

        const [order] = await db.insert(ordersTable).values({
          orderNumber,
          userId,
          certificateId: cert.id,
          status: "pending_payment",
          total: String(total),
          clientType: orderData.clientType,
          customerName: orderData.customerName,
          customerCpfCnpj: orderData.customerCpfCnpj.replace(/\D/g, ""),
          customerEmail: orderData.customerEmail || null,
          customerPhone: orderData.customerPhone || null,
          companyName: orderData.companyName || null,
          addressZipcode: orderData.addressZipcode || null,
          addressStreet: orderData.addressStreet || null,
          addressNumber: orderData.addressNumber || null,
          addressNeighborhood: orderData.addressNeighborhood || null,
          addressCity: orderData.addressCity || null,
          addressState: orderData.addressState || null,
          extendedWarranty: orderData.extendedWarranty,
          chatDocuments,
        }).returning();

        const [settings] = await db.select().from(settingsTable).limit(1);
        const pixKey = (settings as Record<string, unknown>)["pixKey"] as string | null ?? null;
        const pixPayload = pixKey ? { pixKey, amount: total, orderNumber: order.orderNumber } : null;

        const confirmMsg = pixPayload
          ? `✅ **Pedido #${order.orderNumber} criado com sucesso!**\n\nTotal: R$ ${total.toFixed(2)}\n\n**Pagamento via PIX:**\nChave PIX: \`${pixPayload.pixKey}\`\nValor: R$ ${total.toFixed(2)}\n\nApós o pagamento, nossa equipe entrará em contato em até 1 hora útil para agendar a emissão.\n\n📧 Atualizações por e-mail em **${orderData.customerEmail}**.`
          : `✅ **Pedido #${order.orderNumber} criado com sucesso!**\n\nTotal: R$ ${total.toFixed(2)}\n\nNossa equipe enviará os dados de pagamento para **${orderData.customerEmail}** em breve.\n\n📧 Você pode acompanhar o pedido em lealcert.com.br/entrar.`;

        res.write(`data: ${JSON.stringify({ content: "\n\n" })}\n\n`);
        res.write(`data: ${JSON.stringify({ content: confirmMsg })}\n\n`);
        res.write(`data: ${JSON.stringify({ action: "order_created", orderId: order.id, orderNumber: order.orderNumber, pixPayload })}\n\n`);
        await db.insert(chatMessages).values({ conversationId: sessionId, role: "assistant", content: confirmMsg });

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
        res.write(`data: ${JSON.stringify({ content: "\n\n❌ Ocorreu um erro ao criar o pedido. Por favor, tente novamente ou entre em contato com nosso suporte." })}\n\n`);
      }
    }
  }

  // Ação: criar chamado de suporte (funciona com ou sem cadastro)
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
        // Usuário com cadastro — abre como ele mesmo
        const [u] = await db.select({ id: usersTable.id }).from(usersTable)
          .where(eq(usersTable.cpfCnpj, verifiedCpfCnpj)).limit(1);
        if (!u) throw new Error("Usuário verificado não encontrado");
        ticketUserId = u.id;
      } else {
        // Sem cadastro — usa o admin (ID mais baixo com role=admin) como sistema
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
        ? `✅ **Chamado #${ticket.id} aberto com sucesso!**\n\nNossa equipe irá analisar sua solicitação e responderá em breve.\nVocê pode acompanhar o chamado em lealcert.com.br/suporte.`
        : `✅ **Chamado #${ticket.id} aberto com sucesso!**\n\nNossa equipe entrará em contato pelo canal informado em breve.`;

      res.write(`data: ${JSON.stringify({ content: "\n\n" })}\n\n`);
      res.write(`data: ${JSON.stringify({ content: confirmMsg })}\n\n`);
      res.write(`data: ${JSON.stringify({ action: "ticket_created", ticketId: ticket.id })}\n\n`);
      await db.insert(chatMessages).values({ conversationId: sessionId, role: "assistant", content: confirmMsg });
    } catch (ticketErr) {
      logger.error({ err: ticketErr }, "Failed to process CRIAR_CHAMADO action");
      res.write(`data: ${JSON.stringify({ content: "\n\n❌ Ocorreu um erro ao abrir o chamado. Tente novamente ou acesse lealcert.com.br/suporte." })}\n\n`);
    }
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
