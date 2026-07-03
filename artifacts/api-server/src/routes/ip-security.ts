import { Router } from "express";
import { eq, desc, and, gte, like, or, isNull } from "drizzle-orm";
import { db, ipLogsTable, ipBlocksTable, ipWhitelistTable, usersTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// ── GET /admin/ip-logs — Todos os registros de acesso ──────────────────────
router.get("/admin/ip-logs", requireAdmin, async (req, res): Promise<void> => {
  const { ip, action, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // últimos 30 dias

  const conditions = [gte(ipLogsTable.createdAt, since)];
  if (ip) conditions.push(like(ipLogsTable.ip, `%${ip}%`));
  if (action) conditions.push(eq(ipLogsTable.action, action));

  const [logs, total] = await Promise.all([
    db
      .select({
        id: ipLogsTable.id,
        ip: ipLogsTable.ip,
        userId: ipLogsTable.userId,
        cpfCnpj: ipLogsTable.cpfCnpj,
        action: ipLogsTable.action,
        country: ipLogsTable.country,
        countryCode: ipLogsTable.countryCode,
        city: ipLogsTable.city,
        isBrazil: ipLogsTable.isBrazil,
        success: ipLogsTable.success,
        blocked: ipLogsTable.blocked,
        createdAt: ipLogsTable.createdAt,
        userName: usersTable.name,
      })
      .from(ipLogsTable)
      .leftJoin(usersTable, eq(ipLogsTable.userId, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(ipLogsTable.createdAt))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ id: ipLogsTable.id })
      .from(ipLogsTable)
      .where(and(...conditions))
      .then(r => r.length),
  ]);

  res.json({ logs, total, page: pageNum, limit: limitNum });
});

// ── GET /admin/ip-blocks — IPs bloqueados e banidos ────────────────────────
router.get("/admin/ip-blocks", requireAdmin, async (req, res): Promise<void> => {
  const { banned } = req.query as Record<string, string>;

  const conditions = [];
  if (banned === "true") conditions.push(eq(ipBlocksTable.isBanned, true));
  if (banned === "false") conditions.push(eq(ipBlocksTable.isBanned, false));

  const blocks = await db
    .select({
      id: ipBlocksTable.id,
      ip: ipBlocksTable.ip,
      attempts: ipBlocksTable.attempts,
      isBanned: ipBlocksTable.isBanned,
      isForeign: ipBlocksTable.isForeign,
      blockedAt: ipBlocksTable.blockedAt,
      unblockAt: ipBlocksTable.unblockAt,
      unblockedAt: ipBlocksTable.unblockedAt,
      country: ipBlocksTable.country,
      countryCode: ipBlocksTable.countryCode,
      city: ipBlocksTable.city,
      notes: ipBlocksTable.notes,
      unblockedByName: usersTable.name,
    })
    .from(ipBlocksTable)
    .leftJoin(usersTable, eq(ipBlocksTable.unblockedBy, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(ipBlocksTable.blockedAt));

  res.json(blocks);
});

// ── GET /admin/ip-whitelist — Listar IPs autorizados ───────────────────────
router.get("/admin/ip-whitelist", requireAdmin, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: ipWhitelistTable.id,
      ip: ipWhitelistTable.ip,
      addedAt: ipWhitelistTable.addedAt,
      notes: ipWhitelistTable.notes,
      country: ipWhitelistTable.country,
      countryCode: ipWhitelistTable.countryCode,
      city: ipWhitelistTable.city,
      addedByName: usersTable.name,
    })
    .from(ipWhitelistTable)
    .leftJoin(usersTable, eq(ipWhitelistTable.addedBy, usersTable.id))
    .orderBy(desc(ipWhitelistTable.addedAt));
  res.json(rows);
});

// ── POST /admin/ip-whitelist — Autorizar IP manualmente ────────────────────
router.post("/admin/ip-whitelist", requireAdmin, async (req, res): Promise<void> => {
  const { ip, notes } = req.body ?? {};
  const adminId = req.session.userId as number;
  if (!ip || typeof ip !== "string") { res.status(400).json({ error: "IP inválido." }); return; }

  const { geolocate } = await import("../lib/ip-security");
  const geo = await geolocate(ip);

  await db.insert(ipWhitelistTable).values({
    ip: ip.trim(),
    addedBy: adminId,
    notes: notes || null,
    country: geo.country,
    countryCode: geo.countryCode,
    city: geo.city,
  }).onConflictDoUpdate({
    target: ipWhitelistTable.ip,
    set: { notes: notes || null, addedBy: adminId },
  });

  logger.info({ ip, adminId }, "ip-whitelist: IP autorizado pelo admin");
  res.json({ ok: true, message: `IP ${ip} autorizado com sucesso.` });
});

// ── DELETE /admin/ip-whitelist/:ip — Remover autorização de IP ─────────────
router.delete("/admin/ip-whitelist/:ip", requireAdmin, async (req, res): Promise<void> => {
  const ip = decodeURIComponent(req.params.ip as string);
  const adminId = req.session.userId as number;
  await db.delete(ipWhitelistTable).where(eq(ipWhitelistTable.ip, ip));
  logger.info({ ip, adminId }, "ip-whitelist: IP removido da whitelist pelo admin");
  res.json({ ok: true, message: `IP ${ip} removido da lista de autorizados.` });
});

// ── POST /admin/ip-blocks/:ip/allow — Desbloquear + autorizar IP ───────────
router.post("/admin/ip-blocks/:ip/allow", requireAdmin, async (req, res): Promise<void> => {
  const ip = decodeURIComponent(req.params.ip as string);
  const adminId = req.session.userId as number;
  const { notes } = req.body ?? {};

  const { geolocate } = await import("../lib/ip-security");
  const geo = await geolocate(ip);

  // Remove qualquer bloqueio/banimento existente
  await db.delete(ipBlocksTable).where(eq(ipBlocksTable.ip, ip));

  // Adiciona à whitelist permanente
  await db.insert(ipWhitelistTable).values({
    ip,
    addedBy: adminId,
    notes: notes || null,
    country: geo.country,
    countryCode: geo.countryCode,
    city: geo.city,
  }).onConflictDoUpdate({
    target: ipWhitelistTable.ip,
    set: { notes: notes || null, addedBy: adminId },
  });

  logger.info({ ip, adminId }, "ip-whitelist: IP desbloqueado e autorizado permanentemente pelo admin");
  res.json({ ok: true, message: `IP ${ip} autorizado permanentemente. Não será bloqueado novamente.` });
});

// ── POST /admin/ip-blocks/:ip/unblock — Desbloquear IP ─────────────────────
router.post("/admin/ip-blocks/:ip/unblock", requireAdmin, async (req, res): Promise<void> => {
  const ip = decodeURIComponent(req.params.ip as string);
  const adminId = req.session.userId as number;
  const { notes } = req.body ?? {};

  const [existing] = await db.select().from(ipBlocksTable).where(eq(ipBlocksTable.ip, ip)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "IP não encontrado." });
    return;
  }
  if (existing.isBanned) {
    res.status(400).json({ error: "IP banido. Use a rota /unban para reverter o banimento." });
    return;
  }

  await db.delete(ipBlocksTable).where(eq(ipBlocksTable.ip, ip));
  logger.info({ ip, adminId }, "ip-security: IP desbloqueado pelo admin");
  res.json({ ok: true, message: `IP ${ip} desbloqueado com sucesso.` });
});

// ── POST /admin/ip-blocks/:ip/ban — Banir IP permanentemente ───────────────
router.post("/admin/ip-blocks/:ip/ban", requireAdmin, async (req, res): Promise<void> => {
  const ip = decodeURIComponent(req.params.ip as string);
  const adminId = req.session.userId as number;
  const { notes } = req.body ?? {};

  const [existing] = await db.select().from(ipBlocksTable).where(eq(ipBlocksTable.ip, ip)).limit(1);

  if (existing) {
    await db.update(ipBlocksTable).set({
      isBanned: true,
      notes: notes || existing.notes,
      blockedAt: new Date(),
      unblockAt: null,
    }).where(eq(ipBlocksTable.ip, ip));
  } else {
    const { geolocate } = await import("../lib/ip-security");
    const geo = await geolocate(ip);
    await db.insert(ipBlocksTable).values({
      ip,
      isBanned: true,
      isForeign: !geo.isBrazil,
      country: geo.country,
      countryCode: geo.countryCode,
      city: geo.city,
      notes: notes || null,
    });
  }

  logger.warn({ ip, adminId }, "ip-security: IP banido permanentemente pelo admin");
  res.json({ ok: true, message: `IP ${ip} banido permanentemente.` });
});

// ── POST /admin/ip-blocks/:ip/unban — Reverter banimento ───────────────────
router.post("/admin/ip-blocks/:ip/unban", requireAdmin, async (req, res): Promise<void> => {
  const ip = decodeURIComponent(req.params.ip as string);
  const adminId = req.session.userId as number;

  const [existing] = await db.select().from(ipBlocksTable).where(eq(ipBlocksTable.ip, ip)).limit(1);
  if (!existing || !existing.isBanned) {
    res.status(404).json({ error: "IP banido não encontrado." });
    return;
  }

  await db.delete(ipBlocksTable).where(eq(ipBlocksTable.ip, ip));
  logger.info({ ip, adminId }, "ip-security: Banimento de IP revertido pelo admin");
  res.json({ ok: true, message: `Banimento do IP ${ip} revertido.` });
});

export default router;
