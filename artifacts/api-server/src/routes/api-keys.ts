import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, apiKeysTable, apiKeyAuditLogsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { API_KEY_LEVELS, API_KEY_SCOPES, generateApiToken } from "../lib/api-keys";

const router = Router();

function publicKey(row: typeof apiKeysTable.$inferSelect) {
  return {
    id: row.id, name: row.name, tokenPrefix: row.tokenPrefix, accessLevel: row.accessLevel,
    scopes: row.scopes, allowedIps: row.allowedIps, rateLimitPerMinute: row.rateLimitPerMinute,
    createdByUserId: row.createdByUserId, expiresAt: row.expiresAt, lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt, isActive: row.isActive, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

router.get("/admin/api-keys/options", requireAdmin, (_req, res): void => {
  res.json({ levels: API_KEY_LEVELS, scopes: API_KEY_SCOPES });
});

router.get("/admin/api-keys", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(apiKeysTable).orderBy(desc(apiKeysTable.createdAt));
  res.json(rows.map(publicKey));
});

router.post("/admin/api-keys", requireAdmin, async (req, res): Promise<void> => {
  const { name, accessLevel, scopes, allowedIps, rateLimitPerMinute, expiresAt } = req.body ?? {};
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanScopes = Array.isArray(scopes) ? [...new Set(scopes.filter((v): v is string => API_KEY_SCOPES.includes(v)))] : [];
  const cleanIps = Array.isArray(allowedIps) ? [...new Set(allowedIps.map(String).map(v => v.trim()).filter(Boolean))] : [];
  const rate = Number(rateLimitPerMinute);
  const expiry = expiresAt ? new Date(expiresAt) : null;
  if (!cleanName || !API_KEY_LEVELS.includes(accessLevel) || cleanScopes.length === 0) {
    res.status(400).json({ error: "Informe nome, nível e ao menos um módulo." }); return;
  }
  if (!Number.isInteger(rate) || rate < 1 || rate > 10000) {
    res.status(400).json({ error: "O limite deve ficar entre 1 e 10.000 requisições por minuto." }); return;
  }
  if (expiry && (Number.isNaN(expiry.getTime()) || expiry <= new Date())) {
    res.status(400).json({ error: "A expiração deve estar no futuro." }); return;
  }
  const adminUserId = req.session.userId;
  if (!adminUserId) {
    res.status(401).json({ error: "Não autenticado." }); return;
  }
  const generated = generateApiToken();
  const [created] = await db.insert(apiKeysTable).values({
    name: cleanName, tokenPrefix: generated.prefix, tokenHash: generated.hash,
    accessLevel, scopes: cleanScopes, allowedIps: cleanIps, rateLimitPerMinute: rate,
    expiresAt: expiry, createdByUserId: adminUserId,
  }).returning();
  res.status(201).json({ ...publicKey(created), token: generated.token });
});

router.patch("/admin/api-keys/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido." }); return; }
  const { name, accessLevel, scopes, allowedIps, rateLimitPerMinute, expiresAt } = req.body ?? {};
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanScopes = Array.isArray(scopes) ? [...new Set(scopes.filter((v): v is string => API_KEY_SCOPES.includes(v)))] : [];
  const cleanIps = Array.isArray(allowedIps) ? [...new Set(allowedIps.map(String).map(v => v.trim()).filter(Boolean))] : [];
  const rate = Number(rateLimitPerMinute);
  const expiry = expiresAt ? new Date(expiresAt) : null;
  if (!cleanName || !API_KEY_LEVELS.includes(accessLevel) || cleanScopes.length === 0) {
    res.status(400).json({ error: "Informe nome, nível e ao menos um módulo." }); return;
  }
  if (!Number.isInteger(rate) || rate < 1 || rate > 10000) {
    res.status(400).json({ error: "O limite deve ficar entre 1 e 10.000 requisições por minuto." }); return;
  }
  if (expiry && Number.isNaN(expiry.getTime())) {
    res.status(400).json({ error: "Data de expiração inválida." }); return;
  }
  const [row] = await db.update(apiKeysTable).set({
    name: cleanName,
    accessLevel,
    scopes: cleanScopes,
    allowedIps: cleanIps,
    rateLimitPerMinute: rate,
    expiresAt: expiry,
  }).where(eq(apiKeysTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Chave não encontrada." }); return; }
  res.json(publicKey(row));
});

router.delete("/admin/api-keys/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido." }); return; }
  const [row] = await db.delete(apiKeysTable).where(eq(apiKeysTable.id, id)).returning({ id: apiKeysTable.id });
  if (!row) { res.status(404).json({ error: "Chave não encontrada." }); return; }
  res.status(204).end();
});

router.post("/admin/api-keys/:id/revoke", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido." }); return; }
  const [row] = await db.update(apiKeysTable).set({ isActive: false, revokedAt: new Date() })
    .where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.isActive, true))).returning();
  if (!row) { res.status(404).json({ error: "Chave ativa não encontrada." }); return; }
  res.json(publicKey(row));
});

router.post("/admin/api-keys/:id/rotate", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido." }); return; }
  const generated = generateApiToken();
  const [row] = await db.update(apiKeysTable).set({
    tokenPrefix: generated.prefix, tokenHash: generated.hash, lastUsedAt: null,
  }).where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.isActive, true))).returning();
  if (!row) { res.status(404).json({ error: "Chave ativa não encontrada." }); return; }
  res.json({ ...publicKey(row), token: generated.token });
});

router.get("/admin/api-keys/:id/audit", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido." }); return; }
  const rows = await db.select().from(apiKeyAuditLogsTable)
    .where(eq(apiKeyAuditLogsTable.apiKeyId, id))
    .orderBy(desc(apiKeyAuditLogsTable.createdAt)).limit(100);
  res.json(rows);
});

export default router;