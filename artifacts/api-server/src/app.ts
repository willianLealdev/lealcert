import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ── Session secret guard ────────────────────────────────────────────────────
const INSECURE_DEFAULT = "lealcert-dev-secret-change-me";
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret === INSECURE_DEFAULT) {
  if (process.env.NODE_ENV === "production") {
    logger.error("SESSION_SECRET ausente ou padrão inseguro — encerrando em produção");
    process.exit(1);
  }
  logger.warn("SESSION_SECRET não definido — usando padrão inseguro (só desenvolvimento)");
} else if (process.env.NODE_ENV === "production" && sessionSecret.length < 32) {
  logger.warn("SESSION_SECRET tem menos de 32 caracteres — recomendado mínimo 32 chars aleatórios");
}
const secret = sessionSecret ?? INSECURE_DEFAULT;

// ── Trust Replit's reverse proxy (HTTPS forwarding) ─────────────────────────
app.set("trust proxy", 1);

// ── Logging (omit query strings and body) ───────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// ── Security headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,   // Needed for embedded payment iframes
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

// Permissions-Policy — disable browser features not used by the API
app.use((_req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// ── Bot / crawler blocker ─────────────────────────────────────────────────────
// Paths whitelisted: webhooks that legitimately come from non-browser UAs
const BOT_WHITELIST_PATHS = new Set([
  "/api/mp/webhook",
  "/api/marketing/webhook/inbound",
]);
// Prefixes whitelisted: tracking pixel fetched by email proxies (GoogleImageProxy etc.)
const BOT_WHITELIST_PREFIXES = ["/api/marketing/track/", "/api/marketing/click/"];

// Patterns that match known scrapers, bots and automation tools.
// Case-insensitive. New entries go at the end.
const BOT_UA_PATTERNS = [
  /bot/i, /crawl/i, /spider/i, /scrape/i, /slurp/i,
  /python-requests/i, /python-urllib/i, /httpx/i, /aiohttp/i,
  /go-http-client/i, /java\//i, /jakarta/i,
  /curl\//i, /wget\//i, /libcurl/i,
  /axios/i, /got\//i, /node-fetch/i, /undici/i,
  /phpunit/i, /guzzle/i, /okhttp/i,
  /semrush/i, /ahrefs/i, /mj12bot/i, /dotbot/i,
  /bingpreview/i, /facebookexternalhit/i, /twitterbot/i,
  /linkedinbot/i, /whatsapp/i,
  /zgrab/i, /masscan/i, /nmap/i, /nikto/i, /sqlmap/i,
  /dirbuster/i, /nuclei/i, /hydra/i, /burpsuite/i,
];

app.use((req: Request, res: Response, next: NextFunction): void => {
  // Webhooks e tracking de terceiros usam UAs não-browser — liberar
  if (BOT_WHITELIST_PATHS.has(req.path)) { next(); return; }
  if (BOT_WHITELIST_PREFIXES.some(p => req.path.startsWith(p))) { next(); return; }

  const ua = req.headers["user-agent"] ?? "";

  // UA vazia = crawler, ferramenta CLI ou scanner — bloquear
  if (!ua.trim()) {
    res.status(404).end();
    return;
  }

  // UA corresponde a padrão de bot conhecido — bloquear
  if (BOT_UA_PATTERNS.some(p => p.test(ua))) {
    logger.debug({ ua, path: req.path }, "bot-blocker: UA bloqueada");
    res.status(404).end();
    return;
  }

  next();
});

// ── CORS — only allow known origins ──────────────────────────────────────────
const allowedOrigins = new Set<string>(["http://localhost:80", "http://localhost:3000"]);
// Replit deployments
(process.env.REPLIT_DOMAINS ?? "").split(",").map(d => d.trim()).filter(Boolean).forEach(d => {
  allowedOrigins.add(`https://${d}`);
});
// Self-hosted: ALLOWED_ORIGINS=https://lealcert.seudominio.com.br (vírgula para múltiplos)
(process.env.ALLOWED_ORIGINS ?? "").split(",").map(d => d.trim()).filter(Boolean).forEach(d => {
  allowedOrigins.add(d);
});

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);                           // server-to-server / mobile
      if (allowedOrigins.has(origin)) return cb(null, true);
      if (process.env.NODE_ENV !== "production") return cb(null, true); // permissive in dev
      cb(new Error(`CORS: origem não permitida: ${origin}`));
    },
    credentials: true,
  }),
);

// ── Body parsing (with size limit) ───────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Auth paths — rate-limited only by the IP-security system (3 fails → block);
// express-rate-limit here would cause legitimate users to be locked out on session expiry.
const AUTH_PATHS = new Set([
  "/api/auth/login", "/api/auth/register",
  "/api/auth/forgot-password", "/api/auth/resend-verification",
  "/api/auth/verify-ip",
]);

// General: 500 req / 15 min per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Nunca limitar webhook e push
    if (req.path === "/api/mp/webhook" || req.path.startsWith("/api/push")) return true;
    // Não limitar usuários já autenticados (sessão válida)
    if ((req.session as unknown as Record<string, unknown>)?.userId) return true;
    // Não limitar rotas de autenticação — o sistema de IP security já faz isso
    if (AUTH_PATHS.has(req.path)) return true;
    return false;
  },
  message: { error: "Muitas requisições. Tente novamente em alguns minutos." },
});

// authLimiter mantido apenas para compatibilidade mas não é mais aplicado no login
// (IP security com bloqueio após 3 falhas é mais preciso que rate-limit por IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente." },
});

// Chat: 60 messages / 15 min per IP — prevents AI cost abuse from anonymous users
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Não limitar usuários autenticados
    if ((req.session as unknown as Record<string, unknown>)?.userId) return true;
    return false;
  },
  message: { error: "Muitas mensagens enviadas. Aguarde alguns minutos." },
});

// Webhook inbound: 60 req / 15 min per IP — prevents reply spam
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições ao webhook." },
});

// VAPID public key: 30 req / 15 min per IP — low-value endpoint, no need for more
const vapidLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições." },
});

// MP Webhook inbound: 30 req / 15 min per IP — signature-verified, low volume expected
const mpWebhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições ao webhook." },
});

// ── Session deve vir ANTES dos rate limiters para que req.session esteja disponível
// nos callbacks skip() — caso contrário usuários autenticados são limitados como anônimos
const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: "session",
      createTableIfMissing: false,
    }),
    secret,
    resave: false,
    saveUninitialized: false,
    name: "sess",                          // avoid default "connect.sid" fingerprinting
    cookie: {
      secure: process.env.NODE_ENV === "production", // HTTPS-only in prod (Replit proxy)
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,             // 30 dias — sessão persiste mesmo fechando o browser
    },
  }),
);

// Rate limiters — registrados DEPOIS da sessão para que skip(req) possa ler req.session.userId
app.use("/api", generalLimiter);
// Login não usa authLimiter — o sistema de IP security (3 falhas → bloqueio) já cobre brute force
// authLimiter fica apenas em rotas de registro e senha esquecida para evitar spam de e-mail
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/resend-verification", authLimiter);  // prevent email spam
app.use("/api/chat", chatLimiter);                      // prevent AI cost abuse
app.use("/api/marketing/webhook/inbound", webhookLimiter);
app.use("/api/push/public-key", vapidLimiter);
app.use("/api/mp/webhook", mpWebhookLimiter);

app.use("/api", router);

// ── Global error handler — must have 4 params to be recognized by Express ────
// Prevents stack traces from leaking to the client in any environment.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction): void => {
  logger.error({ err, method: req.method, path: req.path }, "Unhandled error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Erro interno do servidor." });
});

export default app;
