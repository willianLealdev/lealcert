import { Router } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  db,
  certificatesTable,
  ordersTable,
  referralCreditCommissionsTable,
  referralCreditUsagesTable,
  settingsTable,
  usersTable,
} from "@workspace/db";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import {
  creditReferralForCompletedOrder,
  ensureReferralCode,
  referralAccount,
  referralCreditBalance,
  redeemReferralCredits,
  REFERRAL_CREDIT_PER_CERTIFICATE,
  REFERRAL_CREDIT_REDEMPTION_VALUE,
} from "../lib/referrals";
import { logger } from "../lib/logger";

const router = Router();

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function saleCounters(rows: Array<{ clientType: "cpf" | "cnpj"; status: string }>) {
  const base = () => ({ total: 0, completed: 0, paid: 0, pending: 0 });
  const cpf = base();
  const cnpj = base();
  for (const row of rows) {
    const bucket = row.clientType === "cnpj" ? cnpj : cpf;
    bucket.total++;
    if (row.status === "completed") bucket.completed++;
    else if (["paid", "protocol_assigned", "aguardando_validacao", "emitido"].includes(row.status)) bucket.paid++;
    else bucket.pending++;
  }
  return { cpf, cnpj };
}

// ── GET /referrals/me — visão sigilosa do escritório contador ────────────────
router.get("/referrals/me", requireAuth, async (req, res): Promise<void> => {
  const account = await referralAccount(req.session.userId as number);
  if (!account) {
    res.status(403).json({ error: "Recurso exclusivo para contadores e seus operadores." });
    return;
  }
  const [owner] = await db.select({ name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, account.ownerId)).limit(1);
  const referralCode = await ensureReferralCode(account.ownerId);
  const [balance, earnedRow, usedRow, referred] = await Promise.all([
    referralCreditBalance(account.ownerId),
    db.select({ value: sql<string>`COALESCE(SUM(${referralCreditCommissionsTable.amount}), 0)` })
      .from(referralCreditCommissionsTable)
      .where(eq(referralCreditCommissionsTable.referrerUserId, account.ownerId)),
    db.select({ value: sql<string>`COALESCE(SUM(${referralCreditUsagesTable.amount}), 0)` })
      .from(referralCreditUsagesTable)
      .where(eq(referralCreditUsagesTable.ownerUserId, account.ownerId)),
    db.select({ id: usersTable.id, name: usersTable.name, createdAt: usersTable.createdAt })
      .from(usersTable)
      .where(and(eq(usersTable.referredByUserId, account.ownerId), eq(usersTable.role, "contador"), eq(usersTable.userType, "contador")))
      .orderBy(desc(usersTable.createdAt)),
  ]);

  const referredIds = referred.map((user) => user.id);
  const sales = referredIds.length
    ? await db.select({ clientType: ordersTable.clientType, status: ordersTable.status, createdAt: ordersTable.createdAt })
      .from(ordersTable).where(inArray(ordersTable.userId, referredIds))
    : [];
  const today = startOfToday();
  const todaySales = sales.filter((sale) => sale.createdAt >= today);
  const [todayCredits] = await db.select({
    value: sql<string>`COALESCE(SUM(${referralCreditCommissionsTable.amount}), 0)`,
  }).from(referralCreditCommissionsTable)
    .where(and(eq(referralCreditCommissionsTable.referrerUserId, account.ownerId), gte(referralCreditCommissionsTable.createdAt, today)));
  const usages = await db.select({
    id: referralCreditUsagesTable.id,
    amount: referralCreditUsagesTable.amount,
    usedAt: referralCreditUsagesTable.createdAt,
    orderId: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    certificateName: certificatesTable.name,
    productValue: ordersTable.total,
  }).from(referralCreditUsagesTable)
    .innerJoin(ordersTable, eq(referralCreditUsagesTable.orderId, ordersTable.id))
    .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
    .where(eq(referralCreditUsagesTable.ownerUserId, account.ownerId))
    .orderBy(desc(referralCreditUsagesTable.createdAt));

  res.json({
    officeName: owner?.name ?? null,
    referralCode,
    creditPerCertificate: REFERRAL_CREDIT_PER_CERTIFICATE,
    redemptionValue: REFERRAL_CREDIT_REDEMPTION_VALUE,
    balance,
    totalEarned: Number(earnedRow[0]?.value ?? 0),
    totalUsed: Number(usedRow[0]?.value ?? 0),
    referred: referred.map(({ name, createdAt }) => ({ name, createdAt })),
    sales: {
      allTime: saleCounters(sales),
      today: saleCounters(todaySales),
      creditsToday: Number(todayCredits?.value ?? 0),
    },
    usedCredits: usages.map((usage) => ({ ...usage, amount: Number(usage.amount), productValue: Number(usage.productValue) })),
  });
});

// ── POST /referrals/pay-with-credits — baixa R$90 e libera o pedido ──────────
router.post("/referrals/pay-with-credits", requireAuth, async (req, res): Promise<void> => {
  const account = await referralAccount(req.session.userId as number);
  const orderId = Number(req.body?.orderId);
  if (!account) {
    res.status(403).json({ error: "Recurso exclusivo para contadores e seus operadores." });
    return;
  }
  if (!Number.isInteger(orderId) || orderId <= 0) {
    res.status(400).json({ error: "Pedido inválido." });
    return;
  }
  try {
    await redeemReferralCredits(account.ownerId, orderId);
    const { logEvent } = await import("../lib/order-events");
    await logEvent(orderId, "payment_confirmed", `Pagamento confirmado com R$ ${REFERRAL_CREDIT_REDEMPTION_VALUE.toFixed(2).replace(".", ",")} em créditos de indicação`, {
      paymentMethod: "credito_indicacao",
      creditUsed: REFERRAL_CREDIT_REDEMPTION_VALUE,
      ownerUserId: account.ownerId,
    });
    const { garAutoComprar } = await import("../lib/gar-auto");
    const { swAutoComprar } = await import("../lib/sw-auto");
    const [settings] = await db.select({ activeProvider: settingsTable.activeProvider }).from(settingsTable).limit(1);
    if (settings?.activeProvider === "safeweb") {
      swAutoComprar(orderId).catch((err: unknown) => logger.error({ err, orderId }, "Indicação: erro ao iniciar Safeweb"));
    } else {
      garAutoComprar(orderId).catch((err: unknown) => logger.error({ err, orderId }, "Indicação: erro ao iniciar GAR"));
    }
    res.json({ ok: true, orderId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível usar os créditos.";
    res.status(400).json({ error: message });
  }
});

// ── GET /admin/referrals — rastreabilidade completa para administração ─────────
router.get("/admin/referrals", requireAdmin, async (_req, res): Promise<void> => {
  const [commissions, usages, referredUsers] = await Promise.all([
    db.select({
      id: referralCreditCommissionsTable.id,
      amount: referralCreditCommissionsTable.amount,
      createdAt: referralCreditCommissionsTable.createdAt,
      orderId: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      orderStatus: ordersTable.status,
      paidValue: ordersTable.total,
      clientType: ordersTable.clientType,
      referrerId: referralCreditCommissionsTable.referrerUserId,
      referredId: referralCreditCommissionsTable.referredUserId,
    }).from(referralCreditCommissionsTable)
      .innerJoin(ordersTable, eq(referralCreditCommissionsTable.orderId, ordersTable.id))
      .orderBy(desc(referralCreditCommissionsTable.createdAt)),
    db.select({
      amount: referralCreditUsagesTable.amount,
      createdAt: referralCreditUsagesTable.createdAt,
      ownerId: referralCreditUsagesTable.ownerUserId,
      orderId: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      productValue: ordersTable.total,
      certificateName: certificatesTable.name,
    }).from(referralCreditUsagesTable)
      .innerJoin(ordersTable, eq(referralCreditUsagesTable.orderId, ordersTable.id))
      .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
      .orderBy(desc(referralCreditUsagesTable.createdAt)),
    db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      referredByUserId: usersTable.referredByUserId,
      createdAt: usersTable.createdAt,
    }).from(usersTable)
      .where(and(eq(usersTable.role, "contador"), eq(usersTable.userType, "contador"))),
  ]);

  const people = new Map(referredUsers.map((user) => [user.id, user]));
  const totals = new Map<number, { earned: number; used: number }>();
  for (const row of commissions) {
    const current = totals.get(row.referrerId) ?? { earned: 0, used: 0 };
    current.earned += Number(row.amount);
    totals.set(row.referrerId, current);
  }
  for (const row of usages) {
    const current = totals.get(row.ownerId) ?? { earned: 0, used: 0 };
    current.used += Number(row.amount);
    totals.set(row.ownerId, current);
  }
  const ranking = Array.from(totals.entries()).map(([userId, values]) => ({
    userId,
    name: people.get(userId)?.name ?? "Contador removido",
    email: people.get(userId)?.email ?? null,
    totalEarned: values.earned,
    totalUsed: values.used,
    balance: values.earned - values.used,
    referralCount: referredUsers.filter((user) => user.referredByUserId === userId).length,
  })).sort((a, b) => b.balance - a.balance || b.totalEarned - a.totalEarned);

  const referrals = referredUsers
    .filter((user) => user.referredByUserId !== null)
    .map((user) => ({
      referrerName: people.get(user.referredByUserId!)?.name ?? "Contador removido",
      referredName: user.name,
      referredEmail: user.email,
      registeredAt: user.createdAt,
    }))
    .sort((a, b) => b.registeredAt.getTime() - a.registeredAt.getTime());
  res.json({
    ranking,
    referrals,
    commissions: commissions.map((row) => ({
      ...row,
      amount: Number(row.amount),
      paidValue: Number(row.paidValue),
      referrerName: people.get(row.referrerId)?.name ?? "Contador removido",
      referredName: people.get(row.referredId)?.name ?? "Contador removido",
    })),
    usages: usages.map((row) => ({
      ...row,
      amount: Number(row.amount),
      productValue: Number(row.productValue),
      ownerName: people.get(row.ownerId)?.name ?? "Contador removido",
    })),
  });
});

export { creditReferralForCompletedOrder };
export default router;