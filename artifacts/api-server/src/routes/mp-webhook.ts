/**
 * POST /mp/webhook — recebe notificações de pagamento do MercadoPago.
 *
 * Fluxo:
 *  1. Extrai paymentId e verifica assinatura HMAC-SHA256 ANTES de responder
 *  2. Só retorna HTTP 200 após assinatura válida (payloads falsos → 401)
 *  3. Atualiza pedido para status "paid"
 *  4. Envia notificação (e-mail + WhatsApp)
 *  5. Dispara registro automático no provedor ativo (Gestão AR ou Safeweb)
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "crypto";
import { db, ordersTable, settingsTable, certificatesTable, usersTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { garAutoComprar } from "../lib/gar-auto";
import { swAutoComprar } from "../lib/sw-auto";
import { logEvent } from "../lib/order-events";
import { notifyOrderStatus } from "../lib/notify";
import { sendPushToUser, sendPushToAdmins } from "../lib/push";

const router = Router();

/**
 * Verifica a assinatura HMAC do MercadoPago.
 * Formato do header x-signature: "ts=TIMESTAMP,v1=HMAC_SHA256"
 * Manifesto a assinar: "id:<paymentId>;request-id:<x-request-id>;ts:<ts>"
 * Ref: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
function verifyMpSignature(
  secret: string,
  xSignature: string,
  xRequestId: string,
  paymentId: string | number,
): boolean {
  try {
    const parts = Object.fromEntries(
      xSignature.split(",").map(p => p.trim().split("=") as [string, string])
    );
    const ts = parts["ts"];
    const v1 = parts["v1"];
    if (!ts || !v1) return false;

    const manifest = `id:${paymentId};request-id:${xRequestId};ts:${ts}`;
    const expected = createHmac("sha256", secret).update(manifest).digest("hex");

    // Constant-time comparison to prevent timing attacks
    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(v1, "hex");
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

router.post("/mp/webhook", async (req, res): Promise<void> => {
  try {
    const topic = req.query.topic as string | undefined;
    const body = req.body as Record<string, unknown>;

    // Eventos que não são pagamento: acknowledge imediato, sem processar
    const isPayment = topic === "payment" || body.type === "payment";
    if (!isPayment) {
      res.sendStatus(200);
      return;
    }

    const paymentId =
      (body.data as Record<string, unknown>)?.id ??
      body.id ??
      (req.query.id as string | undefined);

    if (!paymentId) {
      logger.warn("mp/webhook: sem paymentId");
      res.sendStatus(200); // acknowledge mas ignora — não há ID para validar
      return;
    }

    // ── Buscar configurações (necessário antes da validação de assinatura) ──
    const [settings] = await db.select().from(settingsTable).limit(1);

    // ── Validação de assinatura ANTES de responder ───────────────────────────
    // Payloads sem assinatura válida recebem 401 — não 200.
    const webhookSecret = settings?.webhookSecret || "";
    if (!webhookSecret) {
      logger.error(
        { paymentId },
        "mp/webhook: webhookSecret não configurado — rejeitando. Configure em Configurações → MercadoPago.",
      );
      res.status(401).end();
      return;
    }

    const xSignature = (req.headers["x-signature"] as string) || "";
    const xRequestId = (req.headers["x-request-id"] as string) || "";

    if (!xSignature) {
      logger.warn({ paymentId }, "mp/webhook: x-signature ausente — rejeitando");
      res.status(401).end();
      return;
    }

    if (!verifyMpSignature(webhookSecret, xSignature, xRequestId, String(paymentId))) {
      logger.warn({ paymentId }, "mp/webhook: assinatura HMAC inválida — rejeitando");
      res.status(401).end();
      return;
    }
    // ────────────────────────────────────────────────────────────────────────

    // Assinatura válida — responder 200 agora para o MP não retentar
    res.sendStatus(200);

    // ── Processamento assíncrono (MP já recebeu o 200) ───────────────────────
    const mpToken = settings?.mpAccessToken || "";
    if (!mpToken) { logger.warn("mp/webhook: MP Access Token não configurado"); return; }

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (!mpRes.ok) {
      logger.warn({ paymentId, status: mpRes.status }, "mp/webhook: falha ao consultar pagamento no MP");
      return;
    }

    const payment = await mpRes.json() as { status: string; external_reference?: string; id?: number };
    logger.info({ paymentId, status: payment.status, ref: payment.external_reference }, "mp/webhook: pagamento consultado");

    if (payment.status !== "approved") return;

    const orderNumber = payment.external_reference;
    if (!orderNumber) { logger.warn({ paymentId }, "mp/webhook: pagamento aprovado sem external_reference"); return; }

    const [row] = await db
      .select({ order: ordersTable, certName: certificatesTable.name })
      .from(ordersTable)
      .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
      .where(eq(ordersTable.orderNumber, orderNumber))
      .limit(1);

    if (!row) { logger.warn({ orderNumber }, "mp/webhook: pedido não encontrado"); return; }
    const order = row.order;

    if (order.status !== "pending_payment" && order.status !== "created") {
      logger.info({ orderId: order.id, status: order.status }, "mp/webhook: pedido já processado, ignorando");
      return;
    }

    // 1. Marcar como pago
    await db.update(ordersTable).set({
      status: "paid",
      mpPaymentId: String(payment.id ?? paymentId),
    }).where(eq(ordersTable.id, order.id));

    logger.info({ orderId: order.id, orderNumber }, "mp/webhook: pedido marcado como PAGO");
    await logEvent(order.id, "payment_confirmed",
      `Pagamento aprovado via MercadoPago — ID #${payment.id ?? paymentId}`,
      { mpPaymentId: String(payment.id ?? paymentId), orderNumber, via: "mercadopago_webhook" });

    // 2a. Push notification ao cliente (se app instalado)
    if (order.userId) {
      sendPushToUser(order.userId, {
        title: "💳 Pagamento confirmado!",
        body: `Pedido ${order.orderNumber} foi pago. Aguarde a emissão do certificado.`,
        tag: `order-paid-${order.id}`,
        url: `/orders/${order.id}`,
      }).catch((err: unknown) => logger.error({ err }, "mp/webhook: erro ao enviar push ao cliente"));
    }

    // 2b. Push notification aos admins — alerta de nova venda
    sendPushToAdmins({
      title: "🛒 Nova venda realizada!",
      body: `Pedido ${order.orderNumber} — ${order.customerName} — R$ ${parseFloat(order.total).toFixed(2).replace(".", ",")}`,
      tag: `sale-${order.id}`,
      url: `/admin/orders/${order.id}`,
    }).catch((err: unknown) => logger.error({ err }, "mp/webhook: erro ao enviar push aos admins"));

    // 2c. Notificar cliente (+ responsável)
    const responsiblePhone = order.userId
      ? await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, order.userId)).limit(1).then(r => r[0]?.phone ?? null)
      : null;
    notifyOrderStatus({
      to: order.customerEmail,
      phone: order.customerPhone,
      responsiblePhone,
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      status: "paid",
      total: parseFloat(order.total),
      certName: row.certName ?? undefined,
    }).catch((err: unknown) => logger.error({ err }, "mp/webhook: erro ao notificar pagamento"));

    // 3. Disparar registro no provedor ativo
    const activeProvider = settings?.activeProvider ?? "gestaoar";
    logger.info({ orderId: order.id, activeProvider }, "mp/webhook: disparando registro no provedor");

    if (activeProvider === "safeweb") {
      await swAutoComprar(order.id);
    } else {
      await garAutoComprar(order.id);
    }

  } catch (err) {
    logger.error({ err }, "mp/webhook: erro inesperado");
    if (!res.headersSent) res.status(500).end();
  }
});

export default router;
