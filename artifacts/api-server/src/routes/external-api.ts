import { Router, type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, apiKeysTable, apiKeyAuditLogsTable } from "@workspace/db";
import { extractTokenPrefix, levelAllowsMethod, requestIp, safelyMatchesHash, scopeForPath, telephonyCapabilityForRequest, type ApiKeyLevel } from "../lib/api-keys";
import usersRouter from "./users";
import ordersRouter from "./orders";
import certificatesRouter from "./certificates";
import slotsRouter from "./slots";
import supportRouter from "./support";
import dashboardRouter from "./dashboard";
import marketingRouter from "./marketing";
import whatsappMarketingRouter from "./whatsapp-marketing";
import discagemRouter from "./discagem";
import renewalsRouter from "./renewals";
import couponsRouter from "./coupons";
import agentesRouter from "./agentes";
import nfseRouter from "./nfse";
import loyaltyRouter from "./loyalty";
import vendedoresAdminRouter from "./vendedores-admin";
import meetingsRouter from "./meetings";
import operatorsRouter from "./operators";
import referralsRouter from "./referrals";
import relatorioFinanceiroRouter from "./relatorio-financeiro";
import externalTelephonyRouter from "./external-telephony";

const router = Router();
const usage = new Map<number, { minute: number; count: number }>();

router.use(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const started = Date.now();
  const blockedPublicPaths = [
    "/marketing/unsubscribe", "/marketing/track/", "/marketing/click/",
    "/marketing/webhook/", "/marketing/wa/webhook/",
    "/discagem/voice/", "/discagem/status/", "/discagem/amd/", "/discagem/audio/",
  ];
  if (blockedPublicPaths.some(path => req.path === path || req.path.startsWith(path))) {
    res.status(404).json({ error: "Endpoint não disponível na API externa." });
    return;
  }
  const authorization = req.headers.authorization ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const prefix = extractTokenPrefix(token);
  if (!prefix) { res.status(401).json({ error: "Chave de API ausente ou inválida." }); return; }

  const [key] = await db.select().from(apiKeysTable).where(eq(apiKeysTable.tokenPrefix, prefix)).limit(1);
  if (!key || !key.isActive || key.revokedAt || !safelyMatchesHash(token, key.tokenHash)) {
    res.status(401).json({ error: "Chave de API inválida ou revogada." }); return;
  }
  if (key.expiresAt && key.expiresAt <= new Date()) {
    res.status(401).json({ error: "Chave de API expirada." }); return;
  }
  const ip = requestIp(req);
  if (key.allowedIps.length > 0 && !key.allowedIps.includes(ip)) {
    res.status(403).json({ error: "IP não autorizado para esta chave." }); return;
  }
  const scope = scopeForPath(req.path);
  if (!scope || !key.scopes.includes(scope)) {
    res.status(403).json({ error: "Módulo não autorizado para esta chave." }); return;
  }
  const telephonyCapability = telephonyCapabilityForRequest(req.path, req.method);
  if (telephonyCapability && !key.telephonyCapabilities.includes(telephonyCapability)) {
    res.status(403).json({ error: `A chave não possui a permissão de telefonia: ${telephonyCapability}.` }); return;
  }
  if (!levelAllowsMethod(key.accessLevel as ApiKeyLevel, req.method)) {
    res.status(403).json({ error: "O nível da chave não permite este método HTTP." }); return;
  }
  const minute = Math.floor(Date.now() / 60000);
  const current = usage.get(key.id);
  const count = current?.minute === minute ? current.count + 1 : 1;
  usage.set(key.id, { minute, count });
  if (count > key.rateLimitPerMinute) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "Limite de requisições da chave excedido." }); return;
  }

  // O contexto abaixo existe apenas durante esta requisição para reutilizar as
  // autorizações das rotas internas. Nunca pode virar uma sessão administrativa.
  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = ((name: string, value: string | number | readonly string[]) => {
    if (name.toLowerCase() === "set-cookie") return res;
    return originalSetHeader(name, value);
  }) as typeof res.setHeader;
  req.session.save = function (callback) {
    callback?.(null);
    return this;
  };
  req.session.userId = key.createdByUserId;
  req.session.role = "admin";
  req.session.userType = "admin";
  void db.update(apiKeysTable).set({ lastUsedAt: new Date() }).where(eq(apiKeysTable.id, key.id));
  res.on("finish", () => {
    void db.insert(apiKeyAuditLogsTable).values({
      apiKeyId: key.id, tokenPrefix: key.tokenPrefix, method: req.method,
      path: req.path, scope, statusCode: res.statusCode,
      durationMs: Date.now() - started, sourceIp: ip || null,
    }).catch(err => req.log.error({ err, apiKeyId: key.id }, "Falha ao registrar auditoria da API externa"));
  });
  next();
});

router.use(externalTelephonyRouter);
router.use(usersRouter);
router.use(ordersRouter);
router.use(certificatesRouter);
router.use(slotsRouter);
router.use(supportRouter);
router.use(dashboardRouter);
router.use(marketingRouter);
router.use(whatsappMarketingRouter);
router.use(discagemRouter);
router.use(renewalsRouter);
router.use(couponsRouter);
router.use(agentesRouter);
router.use(nfseRouter);
router.use(loyaltyRouter);
router.use(vendedoresAdminRouter);
router.use(meetingsRouter);
router.use(operatorsRouter);
router.use(referralsRouter);
router.use(relatorioFinanceiroRouter);

router.use((_req, res): void => {
  res.status(404).json({ error: "Endpoint externo não encontrado." });
});

export default router;