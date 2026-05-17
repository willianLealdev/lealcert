import { Router } from "express";
import { eq, desc, sql, count, sum, and, gte, lte, inArray } from "drizzle-orm";
import { db, ordersTable, usersTable, certificatesTable, slotsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// Paid / protocol statuses
const PAID_STATUSES = ["paid", "protocol_assigned", "completed"] as const;
const PENDING_STATUSES = ["created", "pending_payment"] as const;

function getRangeBounds(range: string, from?: string, to?: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (range === "custom" && from && to) {
    const s = new Date(from); s.setHours(0, 0, 0, 0);
    const e = new Date(to); e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  switch (range) {
    case "today": break;
    case "7d":  start.setDate(start.getDate() - 6); break;
    case "15d": start.setDate(start.getDate() - 14); break;
    case "90d": start.setDate(start.getDate() - 89); break;
    case "30d":
    default:    start.setDate(start.getDate() - 29); break;
  }
  return { start, end };
}

function fmtBRDate(d: Date | string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR") + " " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ─── Legacy endpoints (kept for backward compat) ─────────────────────────────

router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const session = req.session as Record<string, unknown>;
  const userId = session.userId as number;
  const role = session.role as string;

  const allOrders = await db.select({
    status: ordersTable.status,
    total: ordersTable.total,
    userId: ordersTable.userId,
    createdAt: ordersTable.createdAt,
  }).from(ordersTable);

  const userOrders = role === "admin" ? allOrders : allOrders.filter(o => o.userId === userId);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const totalOrders = userOrders.length;
  const pendingOrders = userOrders.filter(o => PENDING_STATUSES.includes(o.status as never)).length;
  const paidOrders = userOrders.filter(o => o.status === "paid").length;
  const completedOrders = userOrders.filter(o => o.status === "completed").length;
  const totalRevenue = userOrders
    .filter(o => PAID_STATUSES.includes(o.status as never))
    .reduce((acc, o) => acc + parseFloat(o.total), 0);
  const todayOrders = userOrders.filter(o => new Date(o.createdAt) >= today).length;
  let totalUsers = 0;
  if (role === "admin") {
    const [result] = await db.select({ count: count() }).from(usersTable);
    totalUsers = result?.count ?? 0;
  }
  res.json({ totalOrders, pendingOrders, paidOrders, completedOrders, totalRevenue, totalUsers, todayOrders });
});

router.get("/dashboard/recent-orders", requireAuth, async (req, res): Promise<void> => {
  const session = req.session as Record<string, unknown>;
  const userId = session.userId as number;
  const role = session.role as string;

  const rows = await db
    .select({ order: ordersTable, userName: usersTable.name, certName: certificatesTable.name })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
    .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
    .orderBy(desc(ordersTable.createdAt))
    .limit(10);

  const filtered = role === "admin" ? rows : rows.filter(r => r.order.userId === userId);
  res.json(filtered.map(r => ({
    id: r.order.id, orderNumber: r.order.orderNumber, userId: r.order.userId,
    userName: r.userName ?? null, certificateId: r.order.certificateId,
    certificateName: r.certName ?? null, status: r.order.status,
    total: parseFloat(r.order.total), clientType: r.order.clientType,
    customerName: r.order.customerName, customerCpfCnpj: r.order.customerCpfCnpj,
    customerEmail: r.order.customerEmail, customerPhone: r.order.customerPhone,
    companyName: r.order.companyName, inssNumber: r.order.inssNumber,
    cnhPath: r.order.cnhPath, scheduledAt: r.order.scheduledAt,
    protocolNumber: r.order.protocolNumber, extendedWarranty: r.order.extendedWarranty,
    addressZipcode: r.order.addressZipcode, addressStreet: r.order.addressStreet,
    addressNumber: r.order.addressNumber, addressNeighborhood: r.order.addressNeighborhood,
    addressCity: r.order.addressCity, addressState: r.order.addressState,
    mpPaymentId: r.order.mpPaymentId, createdAt: r.order.createdAt, updatedAt: r.order.updatedAt,
  })));
});

router.get("/dashboard/orders-by-day", requireAuth, async (req, res): Promise<void> => {
  const session = req.session as Record<string, unknown>;
  const userId = session.userId as number;
  const role = session.role as string;

  const rows = await db.select({
    date: sql<string>`DATE(${ordersTable.createdAt})`.as("date"),
    count: count(),
    userId: ordersTable.userId,
  }).from(ordersTable)
    .groupBy(sql`DATE(${ordersTable.createdAt})`, ordersTable.userId)
    .orderBy(sql`DATE(${ordersTable.createdAt})`);

  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
  const byDate = new Map<string, number>();
  for (const r of rows) {
    if (new Date(r.date) < cutoff) continue;
    if (role !== "admin" && r.userId !== userId) continue;
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.count);
  }
  res.json(Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })));
});

// ─── NEW: Full admin dashboard stats ─────────────────────────────────────────

router.get("/dashboard/admin-stats", requireAuth, async (req, res): Promise<void> => {
  const session = req.session as Record<string, unknown>;
  if (session.role !== "admin") { res.status(403).json({ error: "Acesso negado." }); return; }

  const range = (req.query.range as string) || "30d";
  const { start, end } = getRangeBounds(range, req.query.from as string, req.query.to as string);

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  // All orders and users (we'll filter in JS for flexibility)
  const allOrders = await db.select({
    id: ordersTable.id,
    userId: ordersTable.userId,
    status: ordersTable.status,
    total: ordersTable.total,
    createdAt: ordersTable.createdAt,
    certificateId: ordersTable.certificateId,
    addressState: ordersTable.addressState,
  }).from(ordersTable);

  const allUsers = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    cpfCnpj: usersTable.cpfCnpj,
    role: usersTable.role,
    createdAt: usersTable.createdAt,
  }).from(usersTable);

  const allCerts = await db.select({ id: certificatesTable.id, name: certificatesTable.name }).from(certificatesTable);
  const certMap = new Map(allCerts.map(c => [c.id, c.name]));

  const contadores = allUsers.filter(u => u.role === "contador");

  // Period filter helpers
  const inPeriod = (d: Date | string) => { const dt = new Date(d); return dt >= start && dt <= end; };
  const isPaid = (s: string) => PAID_STATUSES.includes(s as never);
  const isPending = (s: string) => PENDING_STATUSES.includes(s as never);
  const isProtocol = (s: string) => s === "protocol_assigned" || s === "completed";

  const periodOrders = allOrders.filter(o => inPeriod(o.createdAt));

  // ── Cards ────────────────────────────────────────────────────────
  const cards = {
    total_users: contadores.length,
    new_users: contadores.filter(u => inPeriod(u.createdAt)).length,
    orders_period: periodOrders.length,
    buyers_period: new Set(periodOrders.map(o => o.userId)).size,
    pending_period: periodOrders.filter(o => isPending(o.status)).length,
    paid_period: periodOrders.filter(o => o.status === "paid").length,
    protocol_period: periodOrders.filter(o => isProtocol(o.status)).length,
  };

  // ── Revenue ──────────────────────────────────────────────────────
  const paidAll = allOrders.filter(o => isPaid(o.status));
  const sumRevenue = (arr: typeof paidAll) => arr.reduce((s, o) => s + parseFloat(o.total), 0);

  const revenue = {
    today: sumRevenue(paidAll.filter(o => { const d = new Date(o.createdAt); return d >= todayStart && d <= todayEnd; })),
    month: sumRevenue(paidAll.filter(o => new Date(o.createdAt) >= monthStart)),
    all: sumRevenue(paidAll),
    period: sumRevenue(periodOrders.filter(o => isPaid(o.status))),
  };

  // ── Users per day ─────────────────────────────────────────────────
  const usersByDay = new Map<string, number>();
  for (const u of contadores) {
    if (!inPeriod(u.createdAt)) continue;
    const d = new Date(u.createdAt).toISOString().split("T")[0];
    usersByDay.set(d, (usersByDay.get(d) ?? 0) + 1);
  }
  const users_per_day = Array.from(usersByDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([d, c]) => ({ d, c }));

  // ── Orders per day ────────────────────────────────────────────────
  const ordersByDay = new Map<string, number>();
  for (const o of periodOrders) {
    const d = new Date(o.createdAt).toISOString().split("T")[0];
    ordersByDay.set(d, (ordersByDay.get(d) ?? 0) + 1);
  }
  const orders_per_day = Array.from(ordersByDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([d, c]) => ({ d, c }));

  // ── Models breakdown (paid/protocol in period) ────────────────────
  const paidPeriodOrders = periodOrders.filter(o => isPaid(o.status));
  const modelCount = new Map<string, number>();
  for (const o of paidPeriodOrders) {
    const name = certMap.get(o.certificateId) ?? "Desconhecido";
    modelCount.set(name, (modelCount.get(name) ?? 0) + 1);
  }
  const models_breakdown = Array.from(modelCount.entries()).sort((a, b) => b[1] - a[1]).map(([label, c]) => ({ label, c }));

  // ── Status breakdown ──────────────────────────────────────────────
  const statusCount = new Map<string, number>();
  for (const o of periodOrders) {
    statusCount.set(o.status, (statusCount.get(o.status) ?? 0) + 1);
  }
  const status_breakdown = Array.from(statusCount.entries()).sort((a, b) => b[1] - a[1]).map(([label, c]) => ({ label, c }));

  // ── Geo states ────────────────────────────────────────────────────
  const stateCount = new Map<string, number>();
  for (const o of allOrders) {
    if (!o.addressState) continue;
    const s = o.addressState.toUpperCase().trim();
    stateCount.set(s, (stateCount.get(s) ?? 0) + 1);
  }
  const geo_states = Array.from(stateCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label, c]) => ({ label, c }));

  // ── Top buyers in period ──────────────────────────────────────────
  const buyerMap = new Map<number, { name: string; doc: string; c: number; last: string }>();
  for (const o of paidPeriodOrders) {
    const user = allUsers.find(u => u.id === o.userId);
    if (!user || user.role !== "contador") continue;
    const existing = buyerMap.get(o.userId);
    if (existing) {
      existing.c++;
      if (new Date(o.createdAt) > new Date(existing.last)) existing.last = o.createdAt.toISOString();
    } else {
      buyerMap.set(o.userId, { name: user.name, doc: user.cpfCnpj, c: 1, last: o.createdAt.toISOString() });
    }
  }
  const top_buyers_period = Array.from(buyerMap.entries())
    .sort((a, b) => b[1].c - a[1].c)
    .slice(0, 10)
    .map(([uid, v]) => ({ uid, name: v.name, doc: v.doc, c: v.c, last: fmtBRDate(v.last), tier: "top" }));

  // ── Revenue 12 months ─────────────────────────────────────────────
  const labels: string[] = [];
  const values: number[] = [];
  const counts: number[] = [];
  const monthRevMap = new Map<string, { v: number; c: number }>();
  for (const o of paidAll) {
    const dt = new Date(o.createdAt);
    const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const entry = monthRevMap.get(ym) ?? { v: 0, c: 0 };
    entry.v += parseFloat(o.total);
    entry.c++;
    monthRevMap.set(ym, entry);
  }
  const refDate = new Date();
  refDate.setDate(1);
  refDate.setMonth(refDate.getMonth() - 11);
  for (let i = 0; i < 12; i++) {
    const ym = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, "0")}`;
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    labels.push(`${monthNames[refDate.getMonth()]}/${refDate.getFullYear()}`);
    values.push(monthRevMap.get(ym)?.v ?? 0);
    counts.push(monthRevMap.get(ym)?.c ?? 0);
    refDate.setMonth(refDate.getMonth() + 1);
  }

  // ── Tiers (lifetime) ──────────────────────────────────────────────
  const TIERS = { top: 1, vip: 5, gold: 10 };
  const lifetimeMap = new Map<number, { name: string; doc: string; c: number; last: string }>();
  for (const o of paidAll) {
    const user = allUsers.find(u => u.id === o.userId);
    if (!user || user.role !== "contador") continue;
    const existing = lifetimeMap.get(o.userId);
    if (existing) {
      existing.c++;
      if (new Date(o.createdAt) > new Date(existing.last)) existing.last = o.createdAt.toISOString();
    } else {
      lifetimeMap.set(o.userId, { name: user.name, doc: user.cpfCnpj, c: 1, last: o.createdAt.toISOString() });
    }
  }
  const tiers_all_time = Array.from(lifetimeMap.entries())
    .sort((a, b) => b[1].c - a[1].c)
    .slice(0, 50)
    .map(([uid, v]) => {
      const tier = v.c >= TIERS.gold ? "gold" : v.c >= TIERS.vip ? "vip" : "top";
      return { uid, name: v.name, doc: v.doc, c: v.c, last: fmtBRDate(v.last), tier };
    });

  res.json({
    cards,
    revenue,
    users_per_day,
    orders_per_day,
    models_breakdown,
    status_breakdown,
    geo_states,
    top_buyers_period,
    revenue12: { labels, values, counts },
    tiers_all_time,
    meta: { tiers: TIERS },
  });
});

// ─── NEW: Contador "me" stats ─────────────────────────────────────────────────

router.get("/dashboard/me-stats", requireAuth, async (req, res): Promise<void> => {
  const session = req.session as Record<string, unknown>;
  const userId = session.userId as number;

  const range = (req.query.range as string) || "30d";
  const { start, end } = getRangeBounds(range, req.query.from as string, req.query.to as string);

  const allOrders = await db.select({
    id: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    userId: ordersTable.userId,
    status: ordersTable.status,
    total: ordersTable.total,
    createdAt: ordersTable.createdAt,
    certificateId: ordersTable.certificateId,
    scheduledAt: ordersTable.scheduledAt,
  }).from(ordersTable).where(eq(ordersTable.userId, userId));

  const allCerts = await db.select({ id: certificatesTable.id, name: certificatesTable.name }).from(certificatesTable);
  const certMap = new Map(allCerts.map(c => [c.id, c.name]));

  const inPeriod = (d: Date | string) => { const dt = new Date(d); return dt >= start && dt <= end; };
  const isPaid = (s: string) => PAID_STATUSES.includes(s as never);
  const isProtocol = (s: string) => s === "protocol_assigned" || s === "completed";

  const periodOrders = allOrders.filter(o => inPeriod(o.createdAt));

  // Cards
  const cards = {
    total: periodOrders.length,
    pending: periodOrders.filter(o => o.status === "created" || o.status === "pending_payment").length,
    paid: periodOrders.filter(o => o.status === "paid").length,
    protocol: periodOrders.filter(o => isProtocol(o.status)).length,
  };

  // Orders per day
  const ordersByDay = new Map<string, number>();
  for (const o of periodOrders) {
    const d = new Date(o.createdAt).toISOString().split("T")[0];
    ordersByDay.set(d, (ordersByDay.get(d) ?? 0) + 1);
  }
  const orders_per_day = Array.from(ordersByDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([d, c]) => ({ d, c }));

  // Models breakdown
  const paidPeriod = periodOrders.filter(o => isPaid(o.status));
  const modelCount = new Map<string, number>();
  for (const o of paidPeriod) {
    const name = certMap.get(o.certificateId) ?? "Desconhecido";
    modelCount.set(name, (modelCount.get(name) ?? 0) + 1);
  }
  const models_breakdown = Array.from(modelCount.entries()).sort((a, b) => b[1] - a[1]).map(([label, c]) => ({ label, c }));

  // Status breakdown
  const statusCount = new Map<string, number>();
  for (const o of periodOrders) {
    statusCount.set(o.status, (statusCount.get(o.status) ?? 0) + 1);
  }
  const status_breakdown = Array.from(statusCount.entries()).sort((a, b) => b[1] - a[1]).map(([label, c]) => ({ label, c }));

  // Next appointments (future scheduled slots for this user)
  const now = new Date();
  const upcoming = allOrders
    .filter(o => o.scheduledAt && new Date(o.scheduledAt) > now)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
    .slice(0, 8)
    .map(o => ({ dt: fmtBRDate(o.scheduledAt!), orderNo: o.orderNumber }));

  res.json({ cards, orders_per_day, models_breakdown, status_breakdown, next_appointments: upcoming });
});

export default router;
