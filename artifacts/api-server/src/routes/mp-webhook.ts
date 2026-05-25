/**
 * POST /mp/webhook — recebe notificações de pagamento do MercadoPago.
 * Ao confirmar pagamento aprovado:
 *  1. Atualiza pedido para status "paid"
 *  2. Dispara registro automático na Gestão AR (garAutoComprar)
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, ordersTable, settingsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { garAutoComprar } from "../lib/gar-auto";

const router = Router();

router.post("/mp/webhook", async (req, res): Promise<void> => {
  res.sendStatus(200); // responde imediatamente para o MP não retentar

  try {
    const topic = req.query.topic as string | undefined;
    const body = req.body as Record<string, unknown>;

    // MP envia `type: "payment"` ou query param `topic=payment`
    const isPayment = topic === "payment" || body.type === "payment";
    if (!isPayment) return;

    const paymentId =
      (body.data as Record<string, unknown>)?.id ??
      body.id ??
      (req.query.id as string | undefined);

    if (!paymentId) {
      logger.warn({ body }, "mp/webhook: sem paymentId");
      return;
    }

    // Buscar credenciais MP para consultar o pagamento
    const [settings] = await db.select().from(settingsTable).limit(1);
    const mpToken = settings?.mpAccessToken || process.env.MP_ACCESS_TOKEN || "";
    if (!mpToken) {
      logger.warn("mp/webhook: MP Access Token não configurado");
      return;
    }

    // Consultar o pagamento na API do MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });

    if (!mpRes.ok) {
      logger.warn({ paymentId, status: mpRes.status }, "mp/webhook: falha ao consultar pagamento no MP");
      return;
    }

    const payment = await mpRes.json() as {
      status: string;
      external_reference?: string;
      id?: number;
    };

    logger.info({ paymentId, status: payment.status, ref: payment.external_reference }, "mp/webhook: pagamento consultado");

    if (payment.status !== "approved") return;

    const orderNumber = payment.external_reference;
    if (!orderNumber) {
      logger.warn({ paymentId }, "mp/webhook: pagamento aprovado sem external_reference");
      return;
    }

    // Localizar o pedido pelo número
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.orderNumber, orderNumber))
      .limit(1);

    if (!order) {
      logger.warn({ orderNumber }, "mp/webhook: pedido não encontrado");
      return;
    }

    // Idempotência: não reprocessar pedidos já pagos
    if (order.status !== "pending_payment" && order.status !== "created") {
      logger.info({ orderId: order.id, status: order.status }, "mp/webhook: pedido já processado, ignorando");
      return;
    }

    // 1. Atualizar status para "paid"
    await db.update(ordersTable).set({
      status: "paid",
      mpPaymentId: String(payment.id ?? paymentId),
    }).where(eq(ordersTable.id, order.id));

    logger.info({ orderId: order.id, orderNumber }, "mp/webhook: pedido marcado como PAGO");

    // 2. Disparar registro automático na Gestão AR
    await garAutoComprar(order.id);

  } catch (err) {
    logger.error({ err }, "mp/webhook: erro inesperado");
  }
});

export default router;
