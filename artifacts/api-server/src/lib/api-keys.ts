import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export const API_KEY_LEVELS = ["read", "write", "full"] as const;
export type ApiKeyLevel = typeof API_KEY_LEVELS[number];

export const API_KEY_SCOPES = [
  "users", "orders", "certificates", "slots", "support", "dashboard",
  "marketing", "whatsapp", "discagem", "renewals", "coupons", "agents",
  "nfse", "loyalty", "vendors", "meetings", "operators", "referrals", "finance",
] as const;
export type ApiKeyScope = typeof API_KEY_SCOPES[number];

export const TELEPHONY_CAPABILITIES = ["analyze", "brain", "command"] as const;
export type TelephonyCapability = typeof TELEPHONY_CAPABILITIES[number];

function hermesEncryptionKey(): Buffer {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error("SESSION_SECRET ausente; não é possível proteger o segredo do Hermes.");
  return createHash("sha256").update(sessionSecret, "utf8").digest();
}

export function encryptHermesWebhookSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", hermesEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptHermesWebhookSecret(encrypted: string): string {
  const [version, ivText, tagText, ciphertextText] = encrypted.split(".");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) throw new Error("Segredo Hermes armazenado em formato inválido.");
  const decipher = createDecipheriv("aes-256-gcm", hermesEncryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function createHermesWebhookAuth(
  rawBody: string,
  webhookKey: string | null | undefined,
  encryptedSecret: string | null | undefined,
  timestamp = String(Date.now()),
): {
  key: string;
  timestamp: string;
  signature: string;
} | null {
  const key = webhookKey?.trim();
  if (!key || !encryptedSecret) return null;
  const secret = decryptHermesWebhookSecret(encryptedSecret);
  return {
    key,
    timestamp,
    signature: createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex"),
  };
}

export interface ExternalBrainKeyCandidate {
  id: number;
  isActive: boolean;
  revokedAt: Date | null;
  expiresAt: Date | null;
  scopes: readonly string[];
  telephonyCapabilities: readonly string[];
  aiWebhookUrl: string | null;
  createdAt: Date;
}

export function selectExternalBrainKey<T extends ExternalBrainKeyCandidate>(
  keys: readonly T[],
  now = new Date(),
): T | null {
  const eligible = keys.filter((key) =>
    key.isActive
    && !key.revokedAt
    && (!key.expiresAt || key.expiresAt > now)
    && key.scopes.includes("discagem")
    && key.telephonyCapabilities.includes("brain")
    && !!key.aiWebhookUrl,
  );

  eligible.sort((a, b) =>
    b.createdAt.getTime() - a.createdAt.getTime()
    || b.id - a.id,
  );

  return eligible[0] ?? null;
}

export const TELEPHONY_CAPABILITY_LABELS: Record<TelephonyCapability, string> = {
  analyze: "Nível 1 — Analisar ligações",
  brain: "Nível 2 — Cérebro comercial em tempo real",
  command: "Nível 3 — Comandar ações",
};

export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  users: "Clientes e contadores",
  orders: "Pedidos",
  certificates: "Certificados",
  slots: "Agenda",
  support: "Suporte",
  dashboard: "Dashboard",
  marketing: "Marketing por e-mail",
  whatsapp: "Marketing por WhatsApp",
  discagem: "Ligações e discagem IA",
  renewals: "Renovações",
  coupons: "Cupons",
  agents: "Agentes",
  nfse: "Notas fiscais",
  loyalty: "Fidelidade",
  vendors: "Vendedores",
  meetings: "Reuniões",
  operators: "Operadores",
  referrals: "Indicações",
  finance: "Relatório financeiro",
};

export function generateApiToken(): { token: string; prefix: string; hash: string } {
  const prefix = randomBytes(6).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const token = `lc_live_${prefix}.${secret}`;
  return { token, prefix: `lc_live_${prefix}`, hash: hashApiToken(token) };
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function safelyMatchesHash(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashApiToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function extractTokenPrefix(token: string): string | null {
  const match = /^(lc_live_[a-f0-9]{12})\.[A-Za-z0-9_-]{40,}$/.exec(token);
  return match?.[1] ?? null;
}

export function requestIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return (value?.trim() || req.ip || req.socket.remoteAddress || "").replace(/^::ffff:/, "");
}

export function scopeForPath(path: string): ApiKeyScope | null {
  if (path.startsWith("/telephony")) return "discagem";
  if (path.startsWith("/admin/discagem") || path.startsWith("/discagem")) return "discagem";
  if (path.startsWith("/admin/relatorio")) return "finance";
  if (path.startsWith("/admin/vendedores")) return "vendors";
  if (path.startsWith("/admin/agentes")) return "agents";
  if (path.startsWith("/marketing/wa")) return "whatsapp";
  const first = path.split("/").filter(Boolean)[0];
  const map: Record<string, ApiKeyScope> = {
    users: "users", orders: "orders", certificates: "certificates", slots: "slots",
    support: "support", dashboard: "dashboard", marketing: "marketing",
    renewals: "renewals", coupons: "coupons", nfse: "nfse", loyalty: "loyalty",
    meetings: "meetings", operators: "operators", referrals: "referrals",
  };
  return first ? map[first] ?? null : null;
}

export function telephonyCapabilityForRequest(path: string, method: string): TelephonyCapability | null {
  const isTelephony = path.startsWith("/telephony")
    || path.startsWith("/admin/discagem")
    || path.startsWith("/discagem");
  if (!isTelephony) return null;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return "analyze";
  return "command";
}

export function levelAllowsMethod(level: ApiKeyLevel, method: string): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  if (level === "read") return false;
  if (method === "DELETE") return level === "full";
  return level === "write" || level === "full";
}