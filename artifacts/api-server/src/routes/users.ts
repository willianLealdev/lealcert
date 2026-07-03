import { Router } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router = Router();

router.get("/users", requireAdmin, async (req, res): Promise<void> => {
  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    cpfCnpj: usersTable.cpfCnpj,
    role: usersTable.role,
    phone: usersTable.phone,
    isActive: usersTable.isActive,
    createdAt: usersTable.createdAt,
  }).from(usersTable).orderBy(usersTable.createdAt);
  res.json(users);
});

router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const { name, email, cpfCnpj, password, role, phone } = req.body ?? {};
  if (!name || !cpfCnpj || !password || !role) {
    res.status(400).json({ error: "Campos obrigatórios: nome, CPF/CNPJ, senha, perfil." });
    return;
  }
  const digits = cpfCnpj.replace(/\D/g, "");
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    name,
    email: email || null,
    cpfCnpj: digits,
    passwordHash,
    role,
    phone: phone || null,
  }).returning();
  res.status(201).json({
    id: user.id,
    name: user.name,
    email: user.email,
    cpfCnpj: user.cpfCnpj,
    role: user.role,
    phone: user.phone,
    isActive: user.isActive,
    createdAt: user.createdAt,
  });
});

// ── GET /users/:id — only admin or the user themselves ──────────────────────
router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  // IDOR guard: non-admin users can only access their own profile
  const sessionRole = req.session.role as string | undefined;
  const sessionUserId = req.session.userId as number;
  if (sessionRole !== "admin" && sessionUserId !== id) {
    res.status(403).json({ error: "Acesso negado." });
    return;
  }

  const [user] = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    cpfCnpj: usersTable.cpfCnpj,
    role: usersTable.role,
    phone: usersTable.phone,
    isActive: usersTable.isActive,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }
  res.json(user);
});

router.patch("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, email, phone, role, userType, isActive, password } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;
  if (role !== undefined) updates.role = role;
  if (userType !== undefined) updates.userType = userType;
  if (isActive !== undefined) updates.isActive = isActive;
  if (password) updates.passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db
    .update(usersTable)
    .set(updates as Parameters<typeof db.update>[0] extends infer T ? Record<string, unknown> : never)
    .where(eq(usersTable.id, id))
    .returning();
  if (!user) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    cpfCnpj: user.cpfCnpj,
    role: user.role,
    phone: user.phone,
    isActive: user.isActive,
    createdAt: user.createdAt,
  });
});

router.delete("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  // Prevent admin from deleting their own account via this route
  if (id === (req.session.userId as number)) {
    res.status(400).json({ error: "Não é possível excluir a própria conta." });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

export default router;
