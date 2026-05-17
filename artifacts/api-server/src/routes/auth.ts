import { Router } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const { cpfCnpj, password } = req.body ?? {};
  if (!cpfCnpj || !password) {
    res.status(400).json({ error: "CPF/CNPJ e senha são obrigatórios." });
    return;
  }
  const digits = cpfCnpj.replace(/\D/g, "");
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.cpfCnpj, digits))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "CPF/CNPJ ou senha inválidos." });
    return;
  }
  if (!user.isActive) {
    res.status(401).json({ error: "Conta desativada. Entre em contato com o administrador." });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "CPF/CNPJ ou senha inválidos." });
    return;
  }
  (req.session as Record<string, unknown>).userId = user.id;
  (req.session as Record<string, unknown>).role = user.role;
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    cpfCnpj: user.cpfCnpj,
    role: user.role,
    phone: user.phone,
    createdAt: user.createdAt,
  });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = (req.session as Record<string, unknown>).userId as number | undefined;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Sessão inválida." });
    return;
  }
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    cpfCnpj: user.cpfCnpj,
    role: user.role,
    phone: user.phone,
    createdAt: user.createdAt,
  });
});

router.patch("/auth/profile", async (req, res): Promise<void> => {
  const userId = (req.session as Record<string, unknown>).userId as number | undefined;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  const { name, email, phone, currentPassword, newPassword } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name) updates.name = name;
  if (email) updates.email = email;
  if (phone) updates.phone = phone;

  if (newPassword) {
    if (!currentPassword) {
      res.status(400).json({ error: "Informe a senha atual." });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: "Senha atual incorreta." });
      return;
    }
    updates.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates as Parameters<typeof db.update>[0] extends infer T ? Record<string, unknown> : never)
    .where(eq(usersTable.id, userId))
    .returning();

  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    cpfCnpj: updated.cpfCnpj,
    role: updated.role,
    phone: updated.phone,
    createdAt: updated.createdAt,
  });
});

export default router;
