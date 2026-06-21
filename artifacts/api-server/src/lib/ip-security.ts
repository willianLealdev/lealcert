/**
 * ip-security.ts — Sistema de segurança baseado em IP.
 * Rastreia tentativas de login, bloqueia IPs suspeitos e verifica
 * logins de IPs diferentes do cadastro.
 */
import { eq, desc, and, gte, lte, isNull, or } from "drizzle-orm";
import { db, ipLogsTable, ipBlocksTable, usersTable } from "@workspace/db";
import { logger } from "./logger";

const MAX_ATTEMPTS = 3;
const BLOCK_HOURS_BRAZIL = 4;

// ── Geolocalização ────────────────────────────────────────────────────────────

export interface GeoInfo {
  country: string;
  countryCode: string;
  city: string;
  isBrazil: boolean;
}

export async function geolocate(ip: string): Promise<GeoInfo> {
  try {
    const geoip = await import("geoip-lite");
    const geo = geoip.default.lookup(ip);
    if (!geo) return { country: "Desconhecido", countryCode: "", city: "", isBrazil: false };
    return {
      country: geo.country === "BR" ? "Brasil" : (geo.country ?? "Desconhecido"),
      countryCode: geo.country ?? "",
      city: Array.isArray(geo.city) ? geo.city[0] : (geo.city ?? ""),
      isBrazil: geo.country === "BR",
    };
  } catch {
    return { country: "Desconhecido", countryCode: "", city: "", isBrazil: false };
  }
}

// ── Extrair IP real da requisição ─────────────────────────────────────────────

export function getClientIp(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first.trim();
  }
  return req.ip ?? "unknown";
}

// ── Verificar se IP está bloqueado ou banido ──────────────────────────────────

export type IpStatus =
  | { status: "ok" }
  | { status: "banned" }
  | { status: "blocked"; isForeign: boolean; unblockAt: Date | null };

export async function checkIpStatus(ip: string): Promise<IpStatus> {
  const [block] = await db
    .select()
    .from(ipBlocksTable)
    .where(eq(ipBlocksTable.ip, ip))
    .limit(1);

  if (!block) return { status: "ok" };
  if (block.isBanned) return { status: "banned" };

  // Temporariamente bloqueado — verifica se já expirou
  if (block.unblockAt && new Date() >= block.unblockAt) {
    // Auto-expirou — remove o bloqueio
    await db.delete(ipBlocksTable).where(eq(ipBlocksTable.ip, ip));
    return { status: "ok" };
  }

  return {
    status: "blocked",
    isForeign: block.isForeign,
    unblockAt: block.unblockAt ?? null,
  };
}

// ── Registrar tentativa de login ──────────────────────────────────────────────

export async function recordLoginAttempt(opts: {
  ip: string;
  cpfCnpj?: string;
  userId?: number | null;
  success: boolean;
  blocked?: boolean;
}): Promise<void> {
  const geo = await geolocate(opts.ip);
  await db.insert(ipLogsTable).values({
    ip: opts.ip,
    userId: opts.userId ?? null,
    cpfCnpj: opts.cpfCnpj ?? null,
    action: opts.success ? "login_success" : (opts.blocked ? "login_blocked" : "login_fail"),
    country: geo.country,
    countryCode: geo.countryCode,
    city: geo.city,
    isBrazil: geo.isBrazil,
    success: opts.success,
    blocked: opts.blocked ?? false,
  }).catch(err => logger.error({ err }, "ip-security: falha ao registrar log"));
}

// ── Registrar IP de cadastro ──────────────────────────────────────────────────

export async function recordRegisterIp(ip: string, userId: number, cpfCnpj: string): Promise<void> {
  const geo = await geolocate(ip);
  await db.insert(ipLogsTable).values({
    ip,
    userId,
    cpfCnpj,
    action: "register",
    country: geo.country,
    countryCode: geo.countryCode,
    city: geo.city,
    isBrazil: geo.isBrazil,
    success: true,
    blocked: false,
  }).catch(err => logger.error({ err }, "ip-security: falha ao registrar log de cadastro"));
}

// ── Processar falha de login — incrementa contagem e bloqueia se necessário ──

export async function handleFailedLogin(ip: string, cpfCnpj?: string): Promise<boolean> {
  const geo = await geolocate(ip);

  const [existing] = await db
    .select()
    .from(ipBlocksTable)
    .where(eq(ipBlocksTable.ip, ip))
    .limit(1);

  if (existing?.isBanned) return true; // já banido

  const attempts = (existing?.attempts ?? 0) + 1;
  const shouldBlock = attempts >= MAX_ATTEMPTS;

  if (shouldBlock) {
    const unblockAt = geo.isBrazil
      ? new Date(Date.now() + BLOCK_HOURS_BRAZIL * 60 * 60 * 1000)
      : null; // IPs estrangeiros ficam bloqueados indefinidamente até admin desbloquear

    if (existing) {
      await db.update(ipBlocksTable).set({
        attempts,
        isForeign: !geo.isBrazil,
        blockedAt: new Date(),
        unblockAt,
        unblockedAt: null,
        country: geo.country,
        countryCode: geo.countryCode,
        city: geo.city,
      }).where(eq(ipBlocksTable.ip, ip));
    } else {
      await db.insert(ipBlocksTable).values({
        ip,
        attempts,
        isForeign: !geo.isBrazil,
        blockedAt: new Date(),
        unblockAt,
        country: geo.country,
        countryCode: geo.countryCode,
        city: geo.city,
      });
    }

    await recordLoginAttempt({ ip, cpfCnpj, success: false, blocked: true });
    logger.warn({ ip, attempts, isBrazil: geo.isBrazil, unblockAt }, "ip-security: IP bloqueado após tentativas excessivas");
    return true;
  }

  // Ainda não atingiu o limite — atualiza contagem
  if (existing) {
    await db.update(ipBlocksTable).set({ attempts }).where(eq(ipBlocksTable.ip, ip));
  } else {
    await db.insert(ipBlocksTable).values({
      ip,
      attempts,
      isForeign: !geo.isBrazil,
      blockedAt: new Date(),
      unblockAt: null,
      country: geo.country,
      countryCode: geo.countryCode,
      city: geo.city,
    }).onConflictDoUpdate({
      target: ipBlocksTable.ip,
      set: { attempts },
    });
  }

  return false;
}

// ── Limpar contagem após login bem-sucedido ────────────────────────────────────

export async function clearFailedAttempts(ip: string): Promise<void> {
  // Remove bloco temporário se existir e não for banido
  await db.delete(ipBlocksTable).where(
    and(
      eq(ipBlocksTable.ip, ip),
      eq(ipBlocksTable.isBanned, false),
    ),
  ).catch(() => {});
}

// ── Verificar se IP é confiável para o usuário ────────────────────────────────

export async function isIpTrusted(userId: number, ip: string): Promise<boolean> {
  const [user] = await db
    .select({ registrationIp: usersTable.registrationIp, trustedIps: usersTable.trustedIps })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) return false;

  const trusted: string[] = Array.isArray(user.trustedIps) ? (user.trustedIps as string[]) : [];
  if (user.registrationIp === ip) return true;
  if (trusted.includes(ip)) return true;

  return false;
}

// ── Adicionar IP à lista de confiáveis do usuário ─────────────────────────────

export async function addTrustedIp(userId: number, ip: string): Promise<void> {
  const [user] = await db
    .select({ trustedIps: usersTable.trustedIps })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const current: string[] = Array.isArray(user?.trustedIps) ? (user.trustedIps as string[]) : [];
  if (current.includes(ip)) return;

  const updated = [...current, ip].slice(-10); // máximo 10 IPs confiáveis por usuário
  await db.update(usersTable).set({ trustedIps: updated }).where(eq(usersTable.id, userId));
}

// ── Gerar código de verificação de IP ────────────────────────────────────────

export function generateIpVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Auto-desbloquear IPs do Brasil após o período de expiração ─────────────────

export async function autoUnblockExpiredIps(): Promise<void> {
  const now = new Date();
  await db.delete(ipBlocksTable).where(
    and(
      eq(ipBlocksTable.isBanned, false),
      lte(ipBlocksTable.unblockAt, now),
    ),
  ).catch(err => logger.error({ err }, "ip-security: erro ao auto-desbloquear IPs"));
}
