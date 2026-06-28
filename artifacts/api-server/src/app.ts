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
    contentSecurityPolicy: false,       // CSP handled by Vite on the frontend
    crossOriginEmbedderPolicy: false,   // Needed for embedded payment iframes
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

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
// General: 200 req / 15 min per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Nunca limitar webhook e push
    if (req.path === "/api/mp/webhook" || req.path.startsWith("/api/push")) return true;
    // Não limitar usuários já autenticados (sessão válida)
    if ((req.session as unknown as Record<string, unknown>)?.userId) return true;
    return false;
  },
  message: { error: "Muitas requisições. Tente novamente em alguns minutos." },
});

// Strict: 10 attempts / 15 min per IP for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
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

app.use("/api", generalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/resend-verification", authLimiter);  // prevent email spam
app.use("/api/chat", chatLimiter);                      // prevent AI cost abuse
app.use("/api/marketing/webhook/inbound", webhookLimiter);

// ── Session (session-only cookie — expires when browser closes) ──────────────
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
      // No maxAge → session cookie: deleted when browser tab/window closes
    },
  }),
);

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
