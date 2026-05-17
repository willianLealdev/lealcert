import { Router } from "express";
import { eq, desc, sql, count, sum } from "drizzle-orm";
import { db, ordersTable, usersTable, certificatesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router = Router();

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalOrders = userOrders.length;
  const pendingOrders = userOrders.filter(o => o.status === "pending_payment" || o.status === "created").length;
  const paidOrders = userOrders.filter(o => o.status === "paid").length;
  const completedOrders = userOrders.filter(o => o.status === "completed").length;
  const totalRevenue = userOrders
    .filter(o => o.status === "paid" || o.status === "protocol_assigned" || o.status === "completed")
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
    id: r.order.id,
    orderNumber: r.order.orderNumber,
    userId: r.order.userId,
    userName: r.userName ?? null,
    certificateId: r.order.certificateId,
    certificateName: r.certName ?? null,
    status: r.order.status,
    total: parseFloat(r.order.total),
    clientType: r.order.clientType,
    customerName: r.order.customerName,
    customerCpfCnpj: r.order.customerCpfCnpj,
    customerEmail: r.order.customerEmail,
    customerPhone: r.order.customerPhone,
    companyName: r.order.companyName,
    inssNumber: r.order.inssNumber,
    cnhPath: r.order.cnhPath,
    scheduledAt: r.order.scheduledAt,
    protocolNumber: r.order.protocolNumber,
    extendedWarranty: r.order.extendedWarranty,
    addressZipcode: r.order.addressZipcode,
    addressStreet: r.order.addressStreet,
    addressNumber: r.order.addressNumber,
    addressNeighborhood: r.order.addressNeighborhood,
    addressCity: r.order.addressCity,
    addressState: r.order.addressState,
    mpPaymentId: r.order.mpPaymentId,
    createdAt: r.order.createdAt,
    updatedAt: r.order.updatedAt,
  })));
});

router.get("/dashboard/orders-by-day", requireAuth, async (req, res): Promise<void> => {
  const session = req.session as Record<string, unknown>;
  const userId = session.userId as number;
  const role = session.role as string;

  const rows = await db
    .select({
      date: sql<string>`DATE(${ordersTable.createdAt})`.as("date"),
      count: count(),
      userId: ordersTable.userId,
    })
    .from(ordersTable)
    .groupBy(sql`DATE(${ordersTable.createdAt})`, ordersTable.userId)
    .orderBy(sql`DATE(${ordersTable.createdAt})`);

  // last 14 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);

  // aggregate by date
  const byDate = new Map<string, number>();
  for (const r of rows) {
    if (new Date(r.date) < cutoff) continue;
    if (role !== "admin" && r.userId !== userId) continue;
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.count);
  }

  const result = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  res.json(result);
});

export default router;
