/**
 * Rotas do painel do Vendedor
 * GET  /api/vendedor/dashboard
 * GET  /api/vendedor/contadores
 * POST /api/vendedor/contadores
 * POST /api/vendedor/contadores/:id/reset-password
 * GET  /api/vendedor/relatorio
 * GET  /api/vendedor/ganhos
 */
import { Router } from "express";
import { eq, and, count, desc, sql, gte, lte } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable, vendedoresTable, vendedorPagamentosTable, ordersTable, loyaltySlotEventsTable } from "@workspace/db";
import { requireVendedor } from "../middlewares/auth";
import { sendContadorWelcomeEmail, sendTempPasswordEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router = Router();

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 8; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

/** Resolve o userId do vendedor logado e retorna também os dados de comissão */
async function getVendedorCtx(userId: number) {
  const [row] = await db
    .select({
      userId: usersTable.id,
      vendedorId: vendedoresTable.id,
      valorPorCert: vendedoresTable.valorPorCert,
      valorBonus: vendedoresTable.valorBonus,
      qtdCertsBonus: vendedoresTable.qtdCertsBonus,
      affiliateCode: vendedoresTable.affiliateCode,
    })
    .from(usersTable)
    .innerJoin(vendedoresTable, eq(vendedoresTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);
  return row ?? null;
}

// ── GET /vendedor/dashboard ──────────────────────────────────────────────────
router.get("/vendedor/dashboard", requireVendedor, async (req, res): Promise<void> => {
  const userId = req.session.userId as number;
  const ctx = await getVendedorCtx(userId);
  if (!ctx) { res.status(404).json({ error: "Vendedor não encontrado." }); return; }

  // Total de contadores vinculados
  const [{ totalContadores }] = await db
    .select({ totalContadores: count() })
    .from(usersTable)
    .where(eq(usersTable.vendedorId, userId));

  // Certificados emitidos (orders completed) pelos contadores vinculados — via loyalty_slot_events para ficar consistente
  const contadoresRows = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.vendedorId, userId));
  const contadorIds = contadoresRows.map(r => r.id);

  // Vendas hoje / mês / ano — contagem de orders completed
  const now = new Date();
  const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear  = new Date(now.getFullYear(), 0, 1);

  let vendasHoje = 0, vendasMes = 0, vendasAno = 0, totalCerts = 0;

  if (contadorIds.length > 0) {
    // total de certs emitidos = loyalty_slot_events (já filtra cortesia)
    const allEvents = await db
      .select({ userId: loyaltySlotEventsTable.userId, createdAt: loyaltySlotEventsTable.createdAt })
      .from(loyaltySlotEventsTable)
      .where(sql`${loyaltySlotEventsTable.userId} = ANY(${sql.raw(`ARRAY[${contadorIds.join(",")}]::int[]`)})`);

    totalCerts = allEvents.length;
    vendasHoje  = allEvents.filter(e => new Date(e.createdAt) >= startOfDay).length;
    vendasMes   = allEvents.filter(e => new Date(e.createdAt) >= startOfMonth).length;
    vendasAno   = allEvents.filter(e => new Date(e.createdAt) >= startOfYear).length;
  }

  // Cálculo de ganhos
  const valorPorCert = parseFloat(ctx.valorPorCert);
  const valorBonus   = parseFloat(ctx.valorBonus);
  const qtdBonus     = ctx.qtdCertsBonus;
  const ganhos       = totalCerts * valorPorCert;
  const bonus        = Math.floor(totalCerts / qtdBonus) * valorBonus;

  // Ranking top 10 contadores
  let ranking: { id: number; name: string; certsEmitidos: number }[] = [];
  if (contadorIds.length > 0) {
    const byContador = await db
      .select({
        userId: loyaltySlotEventsTable.userId,
        certsEmitidos: count(),
      })
      .from(loyaltySlotEventsTable)
      .where(sql`${loyaltySlotEventsTable.userId} = ANY(${sql.raw(`ARRAY[${contadorIds.join(",")}]::int[]`)})`)
      .groupBy(loyaltySlotEventsTable.userId)
      .orderBy(desc(count()))
      .limit(10);

    ranking = await Promise.all(
      byContador.map(async (row) => {
        const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.userId)).limit(1);
        return { id: row.userId, name: u?.name ?? "—", certsEmitidos: Number(row.certsEmitidos) };
      })
    );
  }

  res.json({
    totalContadores: Number(totalContadores),
    vendasHoje,
    vendasMes,
    vendasAno,
    totalCerts,
    ganhos,
    bonus,
    saldoTotal: ganhos + bonus,
    affiliateCode: ctx.affiliateCode,
    ranking,
  });
});

// ── GET /vendedor/contadores ─────────────────────────────────────────────────
router.get("/vendedor/contadores", requireVendedor, async (req, res): Promise<void> => {
  const userId = req.session.userId as number;
  const rows = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    cpfCnpj: usersTable.cpfCnpj,
    phone: usersTable.phone,
    isActive: usersTable.isActive,
    mustChangePassword: usersTable.mustChangePassword,
    createdAt: usersTable.createdAt,
    userType: usersTable.userType,
    companyName: usersTable.companyName,
  })
    .from(usersTable)
    .where(eq(usersTable.vendedorId, userId))
    .orderBy(desc(usersTable.createdAt));
  res.json(rows);
});

// ── POST /vendedor/contadores ────────────────────────────────────────────────
router.post("/vendedor/contadores", requireVendedor, async (req, res): Promise<void> => {
  const userId = req.session.userId as number;
  const {
    name, email, cpfCnpj, phone, userType,
    personType, companyName, companyFantasyName,
    responsibleCpf, responsibleName,
    zipCode, street, addressNumber, complement, neighborhood, city, addressState,
    tempPassword: customTempPass,
  } = req.body ?? {};

  if (!name || !email || !cpfCnpj) {
    res.status(400).json({ error: "Nome, e-mail e CPF/CNPJ são obrigatórios." });
    return;
  }

  const digits = String(cpfCnpj).replace(/\D/g, "");
  // Verifica duplicata
  const existing = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.cpfCnpj, digits)).limit(1);
  if (existing.length) { res.status(409).json({ error: "CPF/CNPJ já cadastrado." }); return; }

  const tempPassword = customTempPass?.trim() || generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const [newUser] = await db.insert(usersTable).values({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    cpfCnpj: digits,
    passwordHash,
    role: "contador",
    userType: userType === "contador" ? "contador" : "cliente",
    personType: personType || "fisica",
    phone: phone ? String(phone).replace(/\D/g, "") || null : null,
    isActive: true,
    emailVerified: true,
    mustChangePassword: true,
    companyName: companyName?.trim() || null,
    companyFantasyName: companyFantasyName?.trim() || null,
    responsibleCpf: responsibleCpf ? String(responsibleCpf).replace(/\D/g, "") || null : null,
    responsibleName: responsibleName?.trim() || null,
    zipCode: zipCode ? String(zipCode).replace(/\D/g, "") || null : null,
    street: street?.trim() || null,
    addressNumber: addressNumber?.trim() || null,
    complement: complement?.trim() || null,
    neighborhood: neighborhood?.trim() || null,
    city: city?.trim() || null,
    addressState: addressState?.trim() || null,
    vendedorId: userId,
  }).returning({ id: usersTable.id });

  // Envia email de boas-vindas ao contador
  if (email) {
    sendContadorWelcomeEmail(email, name.trim(), tempPassword).catch(err =>
      logger.error({ err }, "Erro ao enviar email de boas-vindas ao contador")
    );
  }

  logger.info({ newUserId: newUser.id, vendedorUserId: userId }, "Contador cadastrado por vendedor");
  res.status(201).json({ id: newUser.id, message: "Contador criado e e-mail de boas-vindas enviado." });
});

// ── POST /vendedor/contadores/:id/reset-password ─────────────────────────────
router.post("/vendedor/contadores/:id/reset-password", requireVendedor, async (req, res): Promise<void> => {
  const vendedorUserId = req.session.userId as number;
  const id = Number(String(req.params.id));

  // Verifica que o contador pertence a este vendedor
  const [user] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, vendedorId: usersTable.vendedorId })
    .from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user || user.vendedorId !== vendedorUserId) {
    res.status(403).json({ error: "Contador não encontrado ou não pertence a você." });
    return;
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await db.update(usersTable).set({ passwordHash, mustChangePassword: true }).where(eq(usersTable.id, id));

  if (user.email) {
    sendTempPasswordEmail(user.email, user.name, tempPassword).catch(err =>
      logger.error({ err }, "Erro ao enviar email de reset para contador")
    );
  }

  res.json({ message: "Senha redefinida e e-mail enviado.", tempPassword });
});

// ── GET /vendedor/relatorio ──────────────────────────────────────────────────
router.get("/vendedor/relatorio", requireVendedor, async (req, res): Promise<void> => {
  const userId = req.session.userId as number;
  const { from, to } = req.query;

  const contadoresRows = await db.select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable).where(eq(usersTable.vendedorId, userId));
  const contadorIds = contadoresRows.map(r => r.id);
  const contadorMap = new Map(contadoresRows.map(r => [r.id, r.name]));

  if (!contadorIds.length) { res.json([]); return; }

  // Busca orders completed dos contadores
  const conditions = [
    sql`${ordersTable.userId} = ANY(${sql.raw(`ARRAY[${contadorIds.join(",")}]::int[]`)})`,
    sql`${ordersTable.status} = 'completed'`,
  ];
  if (from) conditions.push(gte(ordersTable.createdAt, new Date(String(from))));
  if (to)   conditions.push(lte(ordersTable.createdAt, new Date(String(to))));

  const orders = await db.select({
    id: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    userId: ordersTable.userId,
    certNameSnapshot: ordersTable.certNameSnapshot,
    total: ordersTable.total,
    paymentMethod: ordersTable.paymentMethod,
    createdAt: ordersTable.createdAt,
  })
    .from(ordersTable)
    .where(and(...conditions))
    .orderBy(desc(ordersTable.createdAt))
    .limit(500);

  const result = orders.map(o => ({
    ...o,
    contadorName: contadorMap.get(o.userId) ?? "—",
    totalNum: parseFloat(o.total),
  }));

  res.json(result);
});

// ── GET /vendedor/ganhos ─────────────────────────────────────────────────────
router.get("/vendedor/ganhos", requireVendedor, async (req, res): Promise<void> => {
  const userId = req.session.userId as number;
  const ctx = await getVendedorCtx(userId);
  if (!ctx) { res.status(404).json({ error: "Vendedor não encontrado." }); return; }

  const contadoresRows = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.vendedorId, userId));
  const contadorIds = contadoresRows.map(r => r.id);

  if (!contadorIds.length) {
    res.json({ meses: [], totalCerts: 0, ganhos: 0, bonus: 0, saldoTotal: 0, valorPorCert: parseFloat(ctx.valorPorCert), valorBonus: parseFloat(ctx.valorBonus), qtdCertsBonus: ctx.qtdCertsBonus });
    return;
  }

  // Agrega por mês usando loyalty_slot_events
  const rows = await db
    .select({
      mes: sql<string>`to_char(${loyaltySlotEventsTable.createdAt}, 'YYYY-MM')`,
      total: count(),
    })
    .from(loyaltySlotEventsTable)
    .where(sql`${loyaltySlotEventsTable.userId} = ANY(${sql.raw(`ARRAY[${contadorIds.join(",")}]::int[]`)})`)
    .groupBy(sql`to_char(${loyaltySlotEventsTable.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${loyaltySlotEventsTable.createdAt}, 'YYYY-MM')`);

  const valorPorCert = parseFloat(ctx.valorPorCert);
  const valorBonus   = parseFloat(ctx.valorBonus);
  const qtdBonus     = ctx.qtdCertsBonus;

  const meses = rows.map(r => ({
    mes: r.mes,
    certsEmitidos: Number(r.total),
    ganho: Number(r.total) * valorPorCert,
  }));

  const totalCerts = meses.reduce((s, r) => s + r.certsEmitidos, 0);
  const ganhos = totalCerts * valorPorCert;
  const bonus  = Math.floor(totalCerts / qtdBonus) * valorBonus;

  // Total já pago ao vendedor
  const [{ totalPagoRaw }] = await db
    .select({ totalPagoRaw: sql<string>`COALESCE(SUM(${vendedorPagamentosTable.valor}), 0)` })
    .from(vendedorPagamentosTable)
    .where(eq(vendedorPagamentosTable.vendedorId, ctx.vendedorId));
  const totalPago = parseFloat(String(totalPagoRaw));
  const saldoBruto = ganhos + bonus;
  const saldoReceber = Math.max(0, saldoBruto - totalPago);

  res.json({ meses, totalCerts, ganhos, bonus, saldoTotal: saldoBruto, totalPago, saldoReceber, valorPorCert, valorBonus, qtdCertsBonus: qtdBonus });
});

export default router;
