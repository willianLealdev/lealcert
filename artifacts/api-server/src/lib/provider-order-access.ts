import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db, ordersTable } from "@workspace/db";
import { canAccessOfficeOrder } from "./order-office-access";

export function isProviderAdmin(req: Request): boolean {
  return !!req.session.userId && (req.session.role === "admin" || req.session.userType === "admin");
}

/** Numeric provider IDs may have padding; opaque protocols must remain exact. */
export function normalizeProviderOrderId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const id = String(value).trim();
  if (!id) return null;
  return /^\d+$/.test(id) ? id.replace(/^0+(?=\d)/, "") : id;
}

export async function requireProviderOrderAccess(
  req: Request,
  res: Response,
  provider: "gar" | "safeweb",
  identifier: unknown,
): Promise<boolean> {
  if (isProviderAdmin(req)) return true;
  const id = normalizeProviderOrderId(identifier);
  if (!id || (provider === "gar" && (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0))) {
    res.status(403).json({ error: "Acesso negado." });
    return false;
  }
  const column = provider === "gar" ? ordersTable.garPedido : ordersTable.safewebSolicitacaoId;
  const rows = await db.select({ userId: ordersTable.userId }).from(ordersTable).where(
    /^\d+$/.test(id)
      ? sql`case when btrim(${column}) ~ '^[0-9]+$' then coalesce(nullif(ltrim(btrim(${column}), '0'), ''), '0') end = ${id}`
      : sql`btrim(${column}) = ${id}`,
  );
  // Missing or conflicting local associations must never reach the provider.
  if (!rows.length) {
    res.status(403).json({ error: "Acesso negado." });
    return false;
  }
  for (const order of rows) {
    if (!await canAccessOfficeOrder(req.session.userId, req.session.role, req.session.userType, order)) {
      res.status(403).json({ error: "Acesso negado." });
      return false;
    }
  }
  return true;
}
