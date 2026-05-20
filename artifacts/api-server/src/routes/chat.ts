import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, conversations, chatMessages, certificatesTable, usersTable, ordersTable, settingsTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
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

function buildSystemPrompt(certs: { id: number; name: string; price: string }[]): string {
  const certList = certs
    .map(c => `- ID:${c.id} | ${c.name} — R$ ${parseFloat(c.price).toFixed(2)}`)
    .join("\n");

  return `Você é a assistente virtual de vendas da LealCert, uma empresa especializada em Certificados Digitais ICP-Brasil.

Seu objetivo é guiar o cliente pelo processo de compra de forma amigável, profissional e eficiente, sem que ele precise fazer login.

**Certificados disponíveis (apresente apenas quando o cliente perguntar ou demonstrar interesse):**
${certList}

**IMPORTANTE sobre A3:**
- Certificados A3 NÃO incluem mídia (cartão/token). O cliente precisa ter seu próprio leitor compatível.
- Sempre mencione isso quando o cliente escolher A3.

**Normalização de dados falados por voz:**
- CPF/CNPJ pode chegar com espaços entre os dígitos (ex: "123 456 789 00") — SEMPRE remova espaços e pontuação, use apenas os dígitos. CPF = 11 dígitos, CNPJ = 14 dígitos.
- CEP pode chegar como "01310100" ou "0 1 3 1 0 1 0 0" — remova espaços. Quando o sistema informar o endereço via [CEP consultado], use esses dados diretamente sem perguntar novamente.
- Telefone pode chegar com espaços entre dígitos — remova espaços e use só números + DDD.
- E-mail pode chegar de várias formas faladas: "joao arroba gmail ponto com" ou "joao @ gmail . com" — SEMPRE reconstrua o e-mail corretamente removendo espaços ao redor de @ e pontos, e convertendo "arroba" em @ e "ponto" em . Exemplo: "joao silva arroba empresa ponto com ponto br" → "joaosilva@empresa.com.br". Se não conseguir montar um e-mail válido, peça para o cliente digitar ou soletrar.

**Fluxo de venda — siga esta ordem:**
1. Cumprimente e pergunte o que o cliente precisa
2. Identifique o tipo de certificado adequado (CPF/CNPJ, A1/A3, validade)
3. Apresente o certificado recomendado com preço
4. Colete os dados necessários UM A UM (não peça tudo de uma vez):
   - Nome completo
   - CPF (se e-CPF) ou CNPJ + Razão Social (se e-CNPJ)
   - E-mail
   - Telefone (WhatsApp)
   - CEP — quando o cliente informar, o sistema buscará o endereço automaticamente
5. Pergunte se deseja garantia estendida (+R$15,00 — cobre falhas de mídia/suporte estendido)
6. Quando tiver TODOS os dados, confirme com o cliente
7. Solicite os documentos obrigatórios. Escreva uma mensagem amigável explicando quais documentos são necessários e, na linha imediatamente seguinte (sem linhas em branco entre elas), inclua a ação:
   - e-CPF → precisa de: RG ou CNH (frente e verso) + Comprovante de residência
     Use: ACAO:SOLICITAR_DOCS:{"tipo":"cpf"}
   - e-CNPJ → precisa de: Cartão CNPJ + Contrato Social ou Requerimento de Empresário + RG/CNH do responsável (frente e verso) + Comprovante de endereço da empresa
     Use: ACAO:SOLICITAR_DOCS:{"tipo":"cnpj"}
8. Aguarde o cliente enviar os documentos. Quando receber mensagem contendo [DOCUMENTOS_ENVIADOS], confirme brevemente o recebimento e prossiga para o próximo passo.
9. Use a ação CRIAR_PEDIDO para registrar o pedido
10. Apresente a chave PIX para pagamento
11. Explique que após confirmação do pagamento, a equipe entrará em contato para agendamento

**Detecção de tipo de cliente:**
- Se o e-mail informado já estiver cadastrado como contador no sistema, informe que o pedido será vinculado à conta dele
- Se não tiver conta, processe normalmente como cliente avulso

**Tom:** Amigável, direto ao ponto, profissional. Use linguagem simples em Português do Brasil.
**NUNCA mostre preços espontaneamente** — apresente apenas quando o cliente perguntar ou quando chegar na etapa de oferta.

Quando tiver todos os dados, confirmação do cliente E documentos enviados ([DOCUMENTOS_ENVIADOS] recebido), responda EXATAMENTE neste formato (sem markdown, sem texto extra antes ou depois):
ACAO:CRIAR_PEDIDO:{"certificateId":<numero_inteiro_do_ID>,"clientType":"cpf|cnpj","customerName":"<nome>","customerCpfCnpj":"<apenas_digitos>","customerEmail":"<email>","customerPhone":"<apenas_digitos_com_ddd>","companyName":"<razao_social_ou_null>","addressZipcode":"<apenas_digitos>","addressStreet":"<rua>","addressNumber":"<numero>","addressNeighborhood":"<bairro>","addressCity":"<cidade>","addressState":"<uf>","extendedWarranty":<true|false>}

ATENÇÃO: certificateId DEVE ser o número inteiro do ID listado acima (ex: 1, 2, 3...). NUNCA use texto ou slug. customerCpfCnpj, customerPhone e addressZipcode devem ter APENAS dígitos, sem pontos, traços ou espaços.`;
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

  // Persist structured doc metadata into the conversation so CRIAR_PEDIDO can find it
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

  const chatHistory = history.map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const activeCerts = await db.select({ id: certificatesTable.id, name: certificatesTable.name, price: certificatesTable.price })
    .from(certificatesTable)
    .where(eq(certificatesTable.active, true));

  const systemPrompt = buildSystemPrompt(activeCerts);

  // Auto-lookup CEP if the user's message contains exactly 8 digits (possibly with spaces)
  const cepDigits = message.replace(/\D/g, "");
  const cepMatch = cepDigits.match(/^(\d{8})$/) ?? message.replace(/\s/g, "").match(/\b(\d{8})\b/);
  if (cepMatch) {
    const cep = (cepMatch[1] ?? cepMatch[0]).replace(/\D/g, "");
    try {
      const cepRes = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (cepRes.ok) {
        const cepData = await cepRes.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string; complemento?: string };
        if (!cepData.erro && cepData.localidade) {
          const addressNote = `[CEP consultado automaticamente] CEP ${cep}: ${cepData.logradouro ?? ""}, bairro ${cepData.bairro ?? ""}, ${cepData.localidade}-${cepData.uf}. Use estes dados para preencher o endereço do cliente (rua, bairro, cidade, estado). Pergunte apenas o número da residência/estabelecimento.`;
          chatHistory.push({ role: "system" as const, content: addressNote });
        }
      }
    } catch (cepErr) {
      logger.warn({ err: cepErr }, "CEP lookup failed");
    }
  }

  let fullResponse = "";

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        ...chatHistory,
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    await db.insert(chatMessages).values({ conversationId: sessionId, role: "assistant", content: fullResponse });

    // Detect document request action
    if (fullResponse.includes("ACAO:SOLICITAR_DOCS:")) {
      const match = fullResponse.match(/ACAO:SOLICITAR_DOCS:\{"tipo":"(cpf|cnpj)"\}/);
      if (match) {
        res.write(`data: ${JSON.stringify({ action: "solicitar_docs", tipo: match[1] })}\n\n`);
      }
    }

    if (fullResponse.includes("ACAO:CRIAR_PEDIDO:")) {
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

        let userId = 1;
        if (orderData.customerEmail) {
          const cleanEmail = orderData.customerEmail.toLowerCase().trim();
          const [existingUser] = await db.select({ id: usersTable.id, role: usersTable.role })
            .from(usersTable)
            .where(eq(usersTable.email, cleanEmail))
            .limit(1);
          if (existingUser) userId = existingUser.id;
        }

        // Gather uploaded document metadata from chat history (stored by upload endpoint)
        const allMsgs = await db.select().from(chatMessages)
          .where(eq(chatMessages.conversationId, sessionId))
          .orderBy(asc(chatMessages.createdAt));
        const docKeyMsg = allMsgs.findLast(m => m.content.startsWith("[DOC_KEYS]"));
        const chatDocuments = docKeyMsg
          ? docKeyMsg.content.replace("[DOC_KEYS] ", "").trim()
          : null;

        let orderNumber: string;
        do {
          const rand = Math.floor(1000 + Math.random() * 9000);
          orderNumber = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${rand}`;
          const [existing] = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.orderNumber, orderNumber)).limit(1);
          if (!existing) break;
        } while (true);

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
        const pixKey = (settings as Record<string, unknown> & typeof settings)["pixKey" as keyof typeof settings] as string | null | undefined ?? null;
        let pixPayload: { pixKey: string; amount: number; orderNumber: string } | null = null;

        if (pixKey) {
          pixPayload = { pixKey, amount: total, orderNumber: order.orderNumber };
        }

        const confirmMsg = pixPayload
          ? `✅ **Pedido #${order.orderNumber} criado com sucesso!**\n\nTotal: R$ ${total.toFixed(2)}\n\n**Pagamento via PIX:**\nChave PIX: \`${pixPayload.pixKey}\`\nValor: R$ ${total.toFixed(2)}\n\nApós o pagamento, nossa equipe entrará em contato em até 1 hora útil para agendar a emissão do certificado.\n\n📧 Você receberá atualizações por e-mail em **${orderData.customerEmail}**.`
          : `✅ **Pedido #${order.orderNumber} criado com sucesso!**\n\nTotal: R$ ${total.toFixed(2)}\n\nNossa equipe enviará os dados de pagamento para **${orderData.customerEmail}** em breve.\n\nVocê também pode acessar e pagar diretamente em **lealcert.com.br/entrar** usando o mesmo e-mail.\n\n📧 Você receberá todas as atualizações por e-mail.`;

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

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    logger.error({ err }, "Chat stream error");
    res.write(`data: ${JSON.stringify({ error: "Erro interno. Tente novamente." })}\n\n`);
    res.end();
  }
});

export default router;
