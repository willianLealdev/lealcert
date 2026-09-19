import { Router } from "express";
import { createHmac } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, apiKeysTable, apiKeyAuditLogsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { API_KEY_LEVELS, API_KEY_SCOPES, TELEPHONY_CAPABILITIES, generateApiToken } from "../lib/api-keys";

const router = Router();

function publicKey(row: typeof apiKeysTable.$inferSelect) {
  return {
    id: row.id, name: row.name, tokenPrefix: row.tokenPrefix, accessLevel: row.accessLevel,
    scopes: row.scopes, telephonyCapabilities: row.telephonyCapabilities, aiWebhookUrl: row.aiWebhookUrl,
    allowedIps: row.allowedIps, rateLimitPerMinute: row.rateLimitPerMinute,
    createdByUserId: row.createdByUserId, expiresAt: row.expiresAt, lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt, isActive: row.isActive, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

router.get("/admin/api-keys/options", requireAdmin, (_req, res): void => {
  res.json({ levels: API_KEY_LEVELS, scopes: API_KEY_SCOPES, telephonyCapabilities: TELEPHONY_CAPABILITIES });
});

router.get("/admin/api-keys", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(apiKeysTable).orderBy(desc(apiKeysTable.createdAt));
  res.json(rows.map(publicKey));
});

router.post("/admin/api-keys", requireAdmin, async (req, res): Promise<void> => {
  const { name, accessLevel, scopes, telephonyCapabilities, aiWebhookUrl, allowedIps, rateLimitPerMinute, expiresAt } = req.body ?? {};
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanScopes = Array.isArray(scopes) ? [...new Set(scopes.filter((v): v is string => API_KEY_SCOPES.includes(v)))] : [];
  const cleanIps = Array.isArray(allowedIps) ? [...new Set(allowedIps.map(String).map(v => v.trim()).filter(Boolean))] : [];
  const cleanCapabilities = Array.isArray(telephonyCapabilities)
    ? [...new Set(telephonyCapabilities.filter((v): v is string => TELEPHONY_CAPABILITIES.includes(v)))]
    : [];
  const cleanWebhookUrl = typeof aiWebhookUrl === "string" && aiWebhookUrl.trim() ? aiWebhookUrl.trim() : null;
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
  if (cleanCapabilities.includes("brain") && !cleanWebhookUrl) {
    res.status(400).json({ error: "Informe a URL do webhook do Hermes para habilitar o nível 2." }); return;
  }
  if (cleanWebhookUrl && !/^https:\/\//i.test(cleanWebhookUrl)) {
    res.status(400).json({ error: "A URL do webhook deve usar HTTPS." }); return;
  }
  const adminUserId = req.session.userId;
  if (!adminUserId) {
    res.status(401).json({ error: "Não autenticado." }); return;
  }
  const generated = generateApiToken();
  const [created] = await db.insert(apiKeysTable).values({
    name: cleanName, tokenPrefix: generated.prefix, tokenHash: generated.hash,
    accessLevel, scopes: cleanScopes, telephonyCapabilities: cleanCapabilities,
    aiWebhookUrl: cleanWebhookUrl, allowedIps: cleanIps, rateLimitPerMinute: rate,
    expiresAt: expiry, createdByUserId: adminUserId,
  }).returning();
  res.status(201).json({ ...publicKey(created), token: generated.token });
});

router.patch("/admin/api-keys/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido." }); return; }
  const { name, accessLevel, scopes, telephonyCapabilities, aiWebhookUrl, allowedIps, rateLimitPerMinute, expiresAt } = req.body ?? {};
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanScopes = Array.isArray(scopes) ? [...new Set(scopes.filter((v): v is string => API_KEY_SCOPES.includes(v)))] : [];
  const cleanIps = Array.isArray(allowedIps) ? [...new Set(allowedIps.map(String).map(v => v.trim()).filter(Boolean))] : [];
  const cleanCapabilities = Array.isArray(telephonyCapabilities)
    ? [...new Set(telephonyCapabilities.filter((v): v is string => TELEPHONY_CAPABILITIES.includes(v)))]
    : [];
  const cleanWebhookUrl = typeof aiWebhookUrl === "string" && aiWebhookUrl.trim() ? aiWebhookUrl.trim() : null;
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
  if (cleanCapabilities.includes("brain") && !cleanWebhookUrl) {
    res.status(400).json({ error: "Informe a URL do webhook do Hermes para habilitar o nível 2." }); return;
  }
  if (cleanWebhookUrl && !/^https:\/\//i.test(cleanWebhookUrl)) {
    res.status(400).json({ error: "A URL do webhook deve usar HTTPS." }); return;
  }
  const [row] = await db.update(apiKeysTable).set({
    name: cleanName,
    accessLevel,
    scopes: cleanScopes,
    telephonyCapabilities: cleanCapabilities,
    aiWebhookUrl: cleanWebhookUrl,
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

router.post("/admin/api-keys/:id/test-hermes", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido." }); return; }
    const [key] = await db.select().from(apiKeysTable).where(eq(apiKeysTable.id, id)).limit(1);
    if (!key) { res.status(404).json({ error: "Chave não encontrada." }); return; }
    if (!key.isActive || key.revokedAt || (key.expiresAt && key.expiresAt <= new Date())) {
      res.status(400).json({ error: "A chave não está ativa ou está expirada." }); return;
    }
    const scopes = Array.isArray(key.scopes) ? key.scopes : [];
    const capabilities = Array.isArray(key.telephonyCapabilities) ? key.telephonyCapabilities : [];
    if (!scopes.includes("discagem") || !capabilities.includes("brain") || !key.aiWebhookUrl) {
      res.status(400).json({ error: "A chave precisa ter o módulo Discagem, o nível Cérebro comercial e um webhook HTTPS." }); return;
    }

    const timestamp = String(Date.now());
    const body = JSON.stringify({
    event: "telephony.turn.requested",
    timestamp,
    context: { diagnostic: true },
    callId: `diagnostic-${timestamp}`,
    lead: { id: null, nome: "Teste de conexão", empresa: null, cidade: null, estado: null, tipo: "contador", telefone: null },
    conversation: [{ speaker: "client", role: "user", text: "[INÍCIO DA LIGAÇÃO]", ts: new Date().toISOString() }],
    stage: "opening",
    lastUserText: "[INÍCIO DA LIGAÇÃO]",
    businessContext: {
      objetivo: "validar conexão síncrona com o Hermes",
      precoParceiro: "R$ 90,00",
      cadastroUrl: "https://lealcert.com.br/contadores",
      cupomAtivo: false,
      cupom: null,
      primeiroCertificadoComCupom: null,
    },
    });
    const signature = createHmac("sha256", key.tokenHash)
      .update(`${timestamp}.${body}`, "utf8")
      .digest("hex");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_500);
    const startedAt = Date.now();
    const recordDiagnostic = async (statusCode: number, durationMs: number, message: string): Promise<void> => {
      await db.insert(apiKeyAuditLogsTable).values({
        apiKeyId: key.id,
        tokenPrefix: key.tokenPrefix,
        method: "POST",
        path: key.aiWebhookUrl!,
        scope: `hermes-diagnostic:${message.slice(0, 900)}`,
        statusCode,
        durationMs,
        sourceIp: req.ip || null,
      }).catch(error => req.log.error({ error, apiKeyId: key.id }, "Falha ao salvar diagnóstico do Hermes"));
    };
    try {
      const response = await fetch(key.aiWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LealCert-Key": key.tokenPrefix,
        "X-LealCert-Timestamp": timestamp,
        "X-LealCert-Signature": `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
      });
      const responseBody = (await response.text()).slice(0, 1_000);
      const latencyMs = Date.now() - startedAt;
      if (!response.ok) {
        const message = `Hermes recusou a chave: HTTP ${response.status}${responseBody ? ` — ${responseBody}` : ""}`;
        await recordDiagnostic(response.status, latencyMs, message);
        res.status(502).json({
          error: message,
          status: response.status,
          latencyMs,
        });
        return;
      }
      let payload: { fala?: unknown; text?: unknown };
      try {
        payload = JSON.parse(responseBody) as { fala?: unknown; text?: unknown };
      } catch {
        await recordDiagnostic(502, latencyMs, "Hermes respondeu com JSON inválido.");
        res.status(502).json({ error: "Hermes respondeu com JSON inválido.", latencyMs }); return;
      }
      const speech = typeof payload.fala === "string" ? payload.fala : payload.text;
      if (typeof speech !== "string" || !speech.trim()) {
        await recordDiagnostic(502, latencyMs, "Hermes respondeu sem uma fala válida.");
        res.status(502).json({ error: "Hermes respondeu sem uma fala válida.", latencyMs }); return;
      }
      await recordDiagnostic(response.status, latencyMs, "Conexão autenticada e resposta válida.");
      res.json({ ok: true, latencyMs, message: "Hermes autenticou a chave e respondeu corretamente." });
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError"
        ? "Hermes excedeu o limite de 4,5 segundos."
        : `Não foi possível acessar o Hermes: ${error instanceof Error ? error.message : String(error)}`;
      const latencyMs = Date.now() - startedAt;
      await recordDiagnostic(502, latencyMs, message);
      res.status(502).json({ error: message, latencyMs });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    res.status(500).json({
      error: `Falha interna ao preparar o diagnóstico: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
});

export default router;