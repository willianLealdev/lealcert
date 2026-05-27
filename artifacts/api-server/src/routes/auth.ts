import { Router } from "express";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { sendVerificationEmail, sendWelcomeEmail, sendTempPasswordEmail } from "../lib/email";

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 8; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function userResponse(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    cpfCnpj: user.cpfCnpj,
    role: user.role,
    userType: user.userType,
    mustChangePassword: user.mustChangePassword,
    phone: user.phone,
    createdAt: user.createdAt,
  };
}

const router = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const { name, email, cpfCnpj, password, phone, userType } = req.body ?? {};
  if (!name || !email || !cpfCnpj || !password) {
    res.status(400).json({ error: "Nome, e-mail, CPF/CNPJ e senha são obrigatórios." });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "A senha deve ter no mínimo 6 caracteres." });
    return;
  }
  const resolvedUserType = userType === "contador" ? "contador" : "cliente";
  const digits = cpfCnpj.replace(/\D/g, "");
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(or(eq(usersTable.cpfCnpj, digits), eq(usersTable.email, email.toLowerCase().trim())))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "CPF/CNPJ ou e-mail já cadastrado." });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await db.insert(usersTable).values({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    cpfCnpj: digits,
    passwordHash,
    phone: phone || null,
    role: "contador",
    userType: resolvedUserType,
    isActive: true,
    emailVerified: false,
    emailVerificationCode: code,
    emailVerificationExpiresAt: expiresAt,
  });
  try {
    await sendVerificationEmail(email, name, code);
  } catch (err) {
    logger.error({ err }, "Failed to send verification email");
  }
  res.status(201).json({ message: "Conta criada! Verifique seu e-mail para ativar o acesso." });
});

router.post("/auth/verify-email", async (req, res): Promise<void> => {
  const { email, code } = req.body ?? {};
  if (!email || !code) {
    res.status(400).json({ error: "E-mail e código são obrigatórios." });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()))
    .limit(1);
  if (!user) {
    res.status(400).json({ error: "E-mail não encontrado." });
    return;
  }
  if (user.emailVerified) {
    res.status(400).json({ error: "E-mail já verificado. Faça login normalmente." });
    return;
  }
  if (!user.emailVerificationCode || user.emailVerificationCode !== code) {
    res.status(400).json({ error: "Código inválido." });
    return;
  }
  if (!user.emailVerificationExpiresAt || new Date() > user.emailVerificationExpiresAt) {
    res.status(400).json({ error: "Código expirado. Solicite um novo código." });
    return;
  }
  await db
    .update(usersTable)
    .set({ emailVerified: true, emailVerificationCode: null, emailVerificationExpiresAt: null })
    .where(eq(usersTable.id, user.id));
  try {
    await sendWelcomeEmail(user.email ?? email, user.name, user.userType);
  } catch (err) {
    logger.error({ err }, "Failed to send welcome email");
  }
  req.session.userId = user.id;
  req.session.role = user.role;
  res.json(userResponse({ ...user, emailVerified: true, emailVerificationCode: null, emailVerificationExpiresAt: null }));
});

router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email) {
    res.status(400).json({ error: "E-mail é obrigatório." });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()))
    .limit(1);
  if (!user) {
    res.status(400).json({ error: "E-mail não encontrado." });
    return;
  }
  if (user.emailVerified) {
    res.status(400).json({ error: "E-mail já verificado." });
    return;
  }
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await db
    .update(usersTable)
    .set({ emailVerificationCode: code, emailVerificationExpiresAt: expiresAt })
    .where(eq(usersTable.id, user.id));
  try {
    await sendVerificationEmail(email, user.name, code);
  } catch (err) {
    logger.error({ err }, "Failed to resend verification email");
  }
  res.json({ message: "Código reenviado. Verifique seu e-mail." });
});

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
  if (!user.emailVerified) {
    res.status(403).json({ error: "E-mail não verificado. Verifique sua caixa de entrada.", email: user.email });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "CPF/CNPJ ou senha inválidos." });
    return;
  }
  req.session.userId = user.id;
  req.session.role = user.role;
  res.json(userResponse(user));
});

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { cpfCnpj } = req.body ?? {};
  if (!cpfCnpj) {
    res.status(400).json({ error: "CPF/CNPJ é obrigatório." });
    return;
  }
  const digits = cpfCnpj.replace(/\D/g, "");
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.cpfCnpj, digits))
    .limit(1);

  if (!user || !user.email) {
    res.json({ message: "Se o CPF/CNPJ estiver cadastrado, você receberá um e-mail com a senha temporária." });
    return;
  }
  if (!user.isActive) {
    res.status(401).json({ error: "Conta desativada. Entre em contato com o administrador." });
    return;
  }
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await db
    .update(usersTable)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(usersTable.id, user.id));
  try {
    await sendTempPasswordEmail(user.email, user.name, tempPassword);
  } catch (err) {
    logger.error({ err }, "Failed to send temp password email");
  }
  res.json({ message: "Se o CPF/CNPJ estiver cadastrado, você receberá um e-mail com a senha temporária." });
});

router.post("/auth/change-password", async (req, res): Promise<void> => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Senha atual e nova senha são obrigatórias." });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "A nova senha deve ter no mínimo 6 caracteres." });
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
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db
    .update(usersTable)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(usersTable.id, user.id));
  res.json({ message: "Senha alterada com sucesso." });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Sessão inválida." });
    return;
  }
  res.json(userResponse(user));
});

router.patch("/auth/profile", async (req, res): Promise<void> => {
  const userId = req.session.userId;
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

  res.json(userResponse(updated));
});

export default router;
