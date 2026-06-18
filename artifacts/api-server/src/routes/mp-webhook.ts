/**
 * POST /mp/webhook — recebe notificações de pagamento do MercadoPago.
 * Ao confirmar pagamento aprovado:
 *  1. Atualiza pedido para status "paid"
 *  2. Envia notificação (e-mail + WhatsApp)
 *  3. Dispara registro automático no provedor ativo (Gestão AR ou Safeweb)
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, ordersTable, settingsTable, certificatesTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { garAutoComprar } from "../lib/gar-auto";
import { swAutoComprar } from "../lib/sw-auto";
import { notifyOrderStatus } from "../lib/notify";
import { sendPushToUser } from "../lib/push";

const router = Router();

router.post("/mp/webhook", async (req, res): Promise<void> => {
  res.sendStatus(200); // responde imediatamente para o MP não retentar

  try {
    const topic = req.query.topic as string | undefined;
    const body = req.body as Record<string, unknown>;

    const isPayment = topic === "payment" || body.type === "payment";
    if (!isPayment) return;

    const paymentId =
      (body.data as Record<string, unknown>)?.id ??
      body.id ??
      (req.query.id as string | undefined);

    if (!paymentId) { logger.warn({ body }, "mp/webhook: sem paymentId"); return; }

    const [settings] = await db.select().from(settingsTable).limit(1);
    const mpToken = settings?.mpAccessToken || process.env.MP_ACCESS_TOKEN || "";
    if (!mpToken) { logger.warn("mp/webhook: MP Access Token não configurado"); return; }

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (!mpRes.ok) { logger.warn({ paymentId, status: mpRes.status }, "mp/webhook: falha ao consultar pagamento no MP"); return; }

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

    // 2a. Push notification (se app instalado)
    if (order.userId) {
      sendPushToUser(order.userId, {
        title: "💳 Pagamento confirmado!",
        body: `Pedido ${order.orderNumber} foi pago. Aguarde a emissão do certificado.`,
        tag: `order-paid-${order.id}`,
        url: `/orders/${order.id}`,
      }).catch((err: unknown) => logger.error({ err }, "mp/webhook: erro ao enviar push"));
    }

    // 2b. Notificar cliente
    notifyOrderStatus({
      to: order.customerEmail,
      phone: order.customerPhone,
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
  }
});

export default router;
