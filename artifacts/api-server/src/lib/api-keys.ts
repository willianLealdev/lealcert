import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
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