import type { Request, Response, NextFunction } from "express";

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
