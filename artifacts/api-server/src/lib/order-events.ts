import { db, orderEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "./logger";

export type EventType =
  | "order_created"
  | "payment_initiated"
  | "payment_confirmed"
  | "gar_sale_registered"
  | "gar_protocol_emitted"
  | "scheduling_confirmed"
  | "gar_status_updated"
  | "certificate_emitted"
  | "order_completed"
  | "order_cancelled"
  | "status_updated"
  | "admin_action"
  | "sync_performed"
  | "payment_failed"
  | "payment_in_process";

export async function logEvent(
  orderId: number,
  eventType: EventType,
  description: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(orderEventsTable).values({
      orderId,
      eventType,
      description,
      metadata: metadata ?? null,
    });
  } catch (err) {
    logger.error({ err, orderId, eventType }, "Falha ao registrar evento do pedido");
  }
}

export async function getOrderEvents(orderId: number) {
  return db
    .select()
    .from(orderEventsTable)
    .where(eq(orderEventsTable.orderId, orderId))
    .orderBy(desc(orderEventsTable.createdAt));
}

// Palavras-chave que indicam certificado emitido no GAR
const EMITIDO_KEYWORDS = ["emitido", "concluído", "concluido", "emissão concluída", "emitida"];

export function isGarStatusEmitido(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return EMITIDO_KEYWORDS.some(k => s.includes(k));
}
