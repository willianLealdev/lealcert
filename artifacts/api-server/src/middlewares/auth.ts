import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  const isAdmin = req.session.role === "admin" || req.session.userType === "admin";
  if (!isAdmin) {
    res.status(403).json({ error: "Acesso negado." });
    return;
  }
  next();
}

export async function requireAgenteOrAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }

  let role = String(req.session.role ?? "");

  if (role !== "agente" && role !== "admin") {
    const [user] = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId))
      .limit(1);
    if (user) {
      role = user.role;
      req.session.role = user.role;
    }
  }

  const isAgente = role === "agente";
  const isAdmin = role === "admin" || String(req.session.userType ?? "") === "admin";

  if (!isAgente && !isAdmin) {
    res.status(403).json({ error: "Acesso negado. Apenas agentes de registro." });
    return;
  }
  next();
}
