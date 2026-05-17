import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = (req.session as Record<string, unknown>).userId;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const userId = (req.session as Record<string, unknown>).userId;
  const role = (req.session as Record<string, unknown>).role;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  if (role !== "admin") {
    res.status(403).json({ error: "Acesso negado." });
    return;
  }
  next();
}
