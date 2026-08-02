/**
 * Loyalty (cartela de fidelidade) — lógica de negócio
 *
 * Regras:
 *  - Exclusivo para userType = "contador"
 *  - A cada 10 certificados emitidos (status = "completed") → 1 cortesia
 *  - Múltiplas cartelas acumulam; cada uso desconta a mais antiga "completed"
 *  - Toda validação ocorre no backend; frontend nunca decide nada
 *  - Idempotência: loyalty_slot_events garante 1 slot por orderId
 */

import { eq, and, asc } from "drizzle-orm";
import {
  db,
  loyaltyCartelasTable,
  loyaltySlotEventsTable,
  usersTable,
} from "@workspace/db";
import { logger } from "./logger";

const SLOTS_PER_CARTELA = 10;

/**
 * Chamado toda vez que um pedido de um contador é marcado como "completed".
 * Idempotente via loyalty_slot_events(orderId) UNIQUE.
 */
export async function incrementLoyaltySlot(
  userId: number,
  orderId: number,
): Promise<void> {
  try {
    // 1) Validar userType = "contador"
    const [user] = await db
      .select({ userType: usersTable.userType })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user || user.userType !== "contador") return;

    // 2) Idempotência: tentar registrar o evento; pular se já registrado
    try {
      await db.insert(loyaltySlotEventsTable).values({ orderId, userId });
    } catch {
      // unique constraint violation — já foi contado
      logger.info({ orderId, userId }, "Loyalty: slot já contado para este pedido, ignorando");
      return;
    }

    // 3) Buscar ou criar cartela ativa
    const [active] = await db
      .select()
      .from(loyaltyCartelasTable)
      .where(
        and(
          eq(loyaltyCartelasTable.userId, userId),
          eq(loyaltyCartelasTable.status, "active"),
        ),
      )
      .orderBy(asc(loyaltyCartelasTable.createdAt))
      .limit(1);

    if (active) {
      const newSlots = Math.min(active.slots + 1, SLOTS_PER_CARTELA);
      const now = new Date();
      await db
        .update(loyaltyCartelasTable)
        .set({
          slots: newSlots,
          status: newSlots >= SLOTS_PER_CARTELA ? "completed" : "active",
          completedAt: newSlots >= SLOTS_PER_CARTELA ? now : active.completedAt,
        })
        .where(eq(loyaltyCartelasTable.id, active.id));

      if (newSlots >= SLOTS_PER_CARTELA) {
        logger.info({ userId, cartelaId: active.id }, "Loyalty: cartela completed — 1 cortesia disponível");
        // Criar nova cartela ativa para o próximo ciclo
        await db.insert(loyaltyCartelasTable).values({ userId });
      }
    } else {
      // Primeira cartela deste usuário
      await db.insert(loyaltyCartelasTable).values({ userId, slots: 1 });
    }

    logger.info({ userId, orderId }, "Loyalty: slot incrementado");
  } catch (err) {
    logger.error({ err, userId, orderId }, "Loyalty: erro ao incrementar slot");
  }
}

/**
 * Conta cartelas "completed" disponíveis para uso.
 * Valida que é contador.
 */
export async function getAvailableCortesias(userId: number): Promise<number> {
  const [user] = await db
    .select({ userType: usersTable.userType })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user || user.userType !== "contador") return 0;

  const rows = await db
    .select({ id: loyaltyCartelasTable.id })
    .from(loyaltyCartelasTable)
    .where(
      and(
        eq(loyaltyCartelasTable.userId, userId),
        eq(loyaltyCartelasTable.status, "completed"),
      ),
    );
  return rows.length;
}

/**
 * Usa a cortesia mais antiga. Double-check backend obrigatório.
 * Retorna cartelaId ou null se não havia.
 */
export async function useCorteisa(
  userId: number,
  orderId: number,
): Promise<number | null> {
  const [user] = await db
    .select({ userType: usersTable.userType })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user || user.userType !== "contador") return null;

  const [cartela] = await db
    .select()
    .from(loyaltyCartelasTable)
    .where(
      and(
        eq(loyaltyCartelasTable.userId, userId),
        eq(loyaltyCartelasTable.status, "completed"),
      ),
    )
    .orderBy(asc(loyaltyCartelasTable.createdAt))
    .limit(1);

  if (!cartela) return null;

  await db
    .update(loyaltyCartelasTable)
    .set({ status: "used", usedAt: new Date(), usedForOrderId: orderId })
    .where(eq(loyaltyCartelasTable.id, cartela.id));

  logger.info({ userId, orderId, cartelaId: cartela.id }, "Loyalty: cortesia utilizada");
  return cartela.id;
}
