import { and, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  referralCreditCommissionsTable,
  referralCreditUsagesTable,
  usersTable,
} from "@workspace/db";
import { logger } from "./logger";

export const REFERRAL_CREDIT_PER_CERTIFICATE = 2;
export const REFERRAL_CREDIT_REDEMPTION_VALUE = 90;

export async function referralAccount(userId: number): Promise<{ ownerId: number; operatorId: number | null } | null> {
  const [user] = await db.select({
    id: usersTable.id,
    role: usersTable.role,
    userType: usersTable.userType,
    contadorId: usersTable.contadorId,
    isActive: usersTable.isActive,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user?.isActive) return null;
  if (user.role === "contador" && user.userType === "contador") return { ownerId: user.id, operatorId: null };
  if (user.role !== "operador" || !user.contadorId) return null;

  const [contador] = await db.select({
    id: usersTable.id,
    role: usersTable.role,
    userType: usersTable.userType,
    isActive: usersTable.isActive,
  }).from(usersTable).where(eq(usersTable.id, user.contadorId)).limit(1);

  if (!contador?.isActive || contador.role !== "contador" || contador.userType !== "contador") return null;
  return { ownerId: contador.id, operatorId: user.id };
}

export async function ensureReferralCode(userId: number): Promise<string> {
  const [user] = await db.select({ referralCode: usersTable.referralCode })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (user?.referralCode) return user.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `IND${userId}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    try {
      const [updated] = await db.update(usersTable)
        .set({ referralCode: code })
        .where(and(eq(usersTable.id, userId), sql`${usersTable.referralCode} IS NULL`))
        .returning({ referralCode: usersTable.referralCode });
      if (updated?.referralCode) return updated.referralCode;
      const [current] = await db.select({ referralCode: usersTable.referralCode })
        .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (current?.referralCode) return current.referralCode;
    } catch {
      // Colisão de código é improvável; tenta novamente com uma nova sequência.
    }
  }
  throw new Error("Não foi possível criar o código de indicação.");
}

export async function referralCreditBalance(userId: number): Promise<number> {
  const [row] = await db.select({
    earned: sql<string>`COALESCE(SUM(${referralCreditCommissionsTable.amount}), 0)`,
  }).from(referralCreditCommissionsTable)
    .where(eq(referralCreditCommissionsTable.referrerUserId, userId));
  const [used] = await db.select({
    used: sql<string>`COALESCE(SUM(${referralCreditUsagesTable.amount}), 0)`,
  }).from(referralCreditUsagesTable)
    .where(eq(referralCreditUsagesTable.ownerUserId, userId));
  return Number(row?.earned ?? 0) - Number(used?.used ?? 0);
}

/** Gera exatamente um crédito para o indicador quando a venda indicada é concluída. */
export async function creditReferralForCompletedOrder(orderId: number): Promise<void> {
  const [row] = await db.select({
    order: ordersTable,
    referredByUserId: usersTable.referredByUserId,
    referredUserType: usersTable.userType,
    referredRole: usersTable.role,
  }).from(ordersTable)
    .innerJoin(usersTable, eq(ordersTable.userId, usersTable.id))
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  if (!row || row.order.status !== "completed" || !row.referredByUserId) return;
  // O programa é comercial entre escritórios contábeis: compras de clientes finais não pontuam.
  if (row.referredUserType !== "contador" || row.referredRole !== "contador") return;

  await db.insert(referralCreditCommissionsTable).values({
    referrerUserId: row.referredByUserId,
    referredUserId: row.order.userId,
    orderId: row.order.id,
    amount: String(REFERRAL_CREDIT_PER_CERTIFICATE),
  }).onConflictDoNothing();

  logger.info({ orderId, referrerUserId: row.referredByUserId, referredUserId: row.order.userId }, "Indicação: crédito processado para pedido concluído");
}

/**
 * Reconcilia lançamentos que falharam momentaneamente após a conclusão do pedido.
 * A restrição única de comissão torna a repetição segura.
 */
export async function reconcileReferralCredits(): Promise<void> {
  const pending = await db.select({ orderId: ordersTable.id })
    .from(ordersTable)
    .innerJoin(usersTable, eq(ordersTable.userId, usersTable.id))
    .leftJoin(referralCreditCommissionsTable, eq(referralCreditCommissionsTable.orderId, ordersTable.id))
    .where(and(
      eq(ordersTable.status, "completed"),
      eq(usersTable.role, "contador"),
      eq(usersTable.userType, "contador"),
      sql`${usersTable.referredByUserId} IS NOT NULL`,
      isNull(referralCreditCommissionsTable.id),
    ));
  for (const { orderId } of pending) {
    try {
      await creditReferralForCompletedOrder(orderId);
    } catch (err) {
      logger.error({ err, orderId }, "Indicação: falha ao reconciliar crédito pendente");
    }
  }
}

/**
 * Resgata R$90 de créditos, com bloqueio da conta na transação para impedir gasto duplo.
 * O pedido precisa continuar sendo de exatamente R$90 para que nenhum saldo financeiro
 * fique pendente depois da baixa automática.
 */
export async function redeemReferralCredits(ownerUserId: number, orderId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${ownerUserId} FOR UPDATE`);

    const [order] = await tx.select().from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, ownerUserId)))
      .limit(1);
    if (!order) throw new Error("Pedido não encontrado para esta conta.");
    if (!["pending_payment", "created"].includes(order.status)) throw new Error("Este pedido não pode usar créditos no estado atual.");
    if (Number(order.total) !== REFERRAL_CREDIT_REDEMPTION_VALUE) {
      throw new Error(`Os créditos de indicação são válidos somente para certificados de R$ ${REFERRAL_CREDIT_REDEMPTION_VALUE.toFixed(2).replace(".", ",")}.`);
    }

    const [earned] = await tx.select({
      value: sql<string>`COALESCE(SUM(${referralCreditCommissionsTable.amount}), 0)`,
    }).from(referralCreditCommissionsTable)
      .where(eq(referralCreditCommissionsTable.referrerUserId, ownerUserId));
    const [used] = await tx.select({
      value: sql<string>`COALESCE(SUM(${referralCreditUsagesTable.amount}), 0)`,
    }).from(referralCreditUsagesTable)
      .where(eq(referralCreditUsagesTable.ownerUserId, ownerUserId));
    const balance = Number(earned?.value ?? 0) - Number(used?.value ?? 0);
    if (balance < REFERRAL_CREDIT_REDEMPTION_VALUE) {
      throw new Error(`Saldo insuficiente. Você possui R$ ${balance.toFixed(2).replace(".", ",")} em créditos.`);
    }

    await tx.insert(referralCreditUsagesTable).values({
      ownerUserId,
      orderId,
      amount: String(REFERRAL_CREDIT_REDEMPTION_VALUE),
    });
    await tx.update(ordersTable).set({
      status: "paid",
      paymentMethod: "credito_indicacao",
      referralCreditUsed: String(REFERRAL_CREDIT_REDEMPTION_VALUE),
    }).where(eq(ordersTable.id, orderId));
  });
}