import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, conversations, chatMessages, certificatesTable, usersTable, ordersTable, settingsTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";
import { sendOrderStatusEmail } from "../lib/email";

const router = Router();

const SYSTEM_PROMPT = `Você é a assistente virtual de vendas da LealCert, uma empresa especializada em Certificados Digitais ICP-Brasil.

Seu objetivo é guiar o cliente pelo processo de compra de forma amigável, profissional e eficiente, sem que ele precise fazer login.

**Certificados disponíveis (apresente apenas quando o cliente perguntar ou demonstrar interesse):**
- e-CPF A1 (1 ano) — R$ 90,00 — Para pessoa física, arquivo digital, renovação anual
- e-CPF A3 (1 ano) — R$ 90,00 — Para pessoa física, cartão/token, 1 ano de validade
- e-CPF A3 (2 anos) — R$ 110,00 — Para pessoa física, cartão/token, 2 anos de validade  
- e-CPF A3 (3 anos) — R$ 130,00 — Para pessoa física, cartão/token, 3 anos de validade
- e-CNPJ A1 (1 ano) — R$ 90,00 — Para empresa, arquivo digital, renovação anual
- e-CNPJ A3 (3 anos) — R$ 150,00 — Para empresa, cartão/token, 3 anos de validade

**IMPORTANTE sobre A3:**
- Certificados A3 NÃO incluem mídia (cartão/token). O cliente precisa ter seu próprio leitor compatível.
- Sempre mencione isso quando o cliente escolher A3.

**Fluxo de venda — siga esta ordem:**
1. Cumprimente e pergunte o que o cliente precisa
2. Identifique o tipo de certificado adequado (CPF/CNPJ, A1/A3, validade)
3. Apresente o certificado recomendado com preço
4. Colete os dados necessários UM A UM (não peça tudo de uma vez):
   - Nome completo
   - CPF (se e-CPF) ou CNPJ + Razão Social (se e-CNPJ)
   - E-mail
   - Telefone (WhatsApp)
   - CEP e endereço completo
5. Pergunte se deseja garantia estendida (+R$15,00 — cobre falhas de mídia/suporte estendido)
6. Quando tiver TODOS os dados, confirme com o cliente
7. Use a ferramenta CRIAR_PEDIDO para registrar o pedido
8. Apresente o QR Code e chave PIX para pagamento
9. Explique que após confirmação do pagamento, a equipe entrará em contato para agendamento

**Detecção de tipo de cliente:**
- Se o e-mail informado já estiver cadastrado como contador no sistema, informe que o pedido será vinculado à conta dele
- Se não tiver conta, processe normalmente como cliente avulso

**Tom:** Amigável, direto ao ponto, profissional. Use linguagem simples em Português do Brasil.
**NUNCA mostre preços espontaneamente** — apresente apenas quando o cliente perguntar ou quando chegar na etapa de oferta.

Quando tiver todos os dados e confirmação do cliente, responda EXATAMENTE neste formato JSON (sem markdown, sem explicação):
ACAO:CRIAR_PEDIDO:{"certificateId":<id>,"clientType":"cpf|cnpj","customerName":"<nome>","customerCpfCnpj":"<cpf_ou_cnpj>","customerEmail":"<email>","customerPhone":"<telefone>","companyName":"<razao_social_ou_null>","addressZipcode":"<cep>","addressStreet":"<rua>","addressNumber":"<numero>","addressNeighborhood":"<bairro>","addressCity":"<cidade>","addressState":"<uf>","extendedWarranty":<true|false>}`;

router.post("/chat/session", async (req, res): Promise<void> => {
  const [conv] = await db.insert(conversations).values({ title: "Chat de Vendas" }).returning();
  res.status(201).json({ id: conv.id, title: conv.title, createdAt: conv.createdAt });
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

  let fullResponse = "";

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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

        const [cert] = await db.select().from(certificatesTable).where(eq(certificatesTable.id, orderData.certificateId)).limit(1);
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
          certificateId: orderData.certificateId,
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
