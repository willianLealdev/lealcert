import { Router } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { sendTempPasswordEmail } from "../lib/email";
import { sendWaText } from "../lib/notify";

const router = Router();

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 8; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function agentRow(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    name: u.name,
    email: u.email ?? null,
    cpfCnpj: u.cpfCnpj,
    phone: u.phone ?? null,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
  };
}

// GET /admin/agentes — list all agents
router.get("/admin/agentes", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(usersTable).where(eq(usersTable.role, "agente")).orderBy(usersTable.createdAt);
  res.json(rows.map(agentRow));
});

// POST /admin/agentes — create agent (sends temp password email)
router.post("/admin/agentes", requireAdmin, async (req, res): Promise<void> => {
  const { name, email, cpfCnpj, phone } = req.body ?? {};
  if (!name || !email || !cpfCnpj) {
    res.status(400).json({ error: "Nome, e-mail e CPF são obrigatórios." });
    return;
  }
  const doc = String(cpfCnpj).replace(/\D/g, "");

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.cpfCnpj, doc)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Já existe um usuário com este CPF/CNPJ." });
    return;
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const [created] = await db.insert(usersTable).values({
    name,
    email,
    cpfCnpj: doc,
    phone: phone || null,
    passwordHash,
    role: "agente",
    isActive: true,
    mustChangePassword: true,
  }).returning();

  logger.info({ id: created.id, email }, "agentes: agente criado");

  try {
    await sendTempPasswordEmail(email, name, tempPassword);
  } catch (err) {
    logger.warn({ err, email }, "agentes: falha ao enviar email de senha temporária");
  }
  if (phone) {
    sendWaText(
      String(phone),
      `*LealCert — Bem-vindo(a), ${name.trim()}!* 👋\n\nSua conta de agente foi criada com sucesso.\n\n🔑 Sua senha temporária é: *${tempPassword}*\n\nAcesse o sistema e troque a senha assim que possível.\n\n⚠️ Por segurança, não compartilhe essa senha com ninguém.`,
    ).catch(() => {});
  }

  res.status(201).json(agentRow(created));
});

// PATCH /admin/agentes/:id — toggle active / update
router.patch("/admin/agentes/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido." }); return; }

  const { isActive, name, phone } = req.body ?? {};
  const update: Partial<typeof usersTable.$inferInsert> = {};
  if (isActive !== undefined) update.isActive = Boolean(isActive);
  if (name) update.name = name;
  if (phone !== undefined) update.phone = phone || null;

  const [updated] = await db.update(usersTable).set(update).where(eq(usersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Agente não encontrado." }); return; }

  res.json(agentRow(updated));
});

// POST /admin/agentes/:id/reset-password — resend temp password
router.post("/admin/agentes/:id/reset-password", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido." }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user || user.role !== "agente") { res.status(404).json({ error: "Agente não encontrado." }); return; }
  if (!user.email) { res.status(400).json({ error: "Agente não possui e-mail cadastrado." }); return; }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await db.update(usersTable).set({ passwordHash, mustChangePassword: true }).where(eq(usersTable.id, id));

  try {
    await sendTempPasswordEmail(user.email, user.name, tempPassword);
  } catch (err) {
    logger.warn({ err, id }, "agentes: falha ao reenviar email");
  }
  if (user.phone) {
    sendWaText(
      user.phone,
      `*LealCert — Redefinição de Senha* 🔑\n\nOlá, ${user.name}!\n\nSua senha foi redefinida pelo administrador.\n\n🔑 Nova senha temporária: *${tempPassword}*\n\nAcesse o sistema e troque a senha assim que possível.\n\n⚠️ Por segurança, não compartilhe essa senha com ninguém.`,
    ).catch(() => {});
  }

  logger.info({ id }, "agentes: senha resetada");
  res.json({ ok: true });
});

// DELETE /admin/agentes/:id — remove agent
router.delete("/admin/agentes/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido." }); return; }

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.json({ ok: true });
});

export default router;
