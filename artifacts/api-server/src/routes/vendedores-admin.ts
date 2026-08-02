/**
 * Admin: CRUD de vendedores
 * GET    /api/admin/vendedores
 * POST   /api/admin/vendedores
 * GET    /api/admin/vendedores/:id
 * PATCH  /api/admin/vendedores/:id
 * DELETE /api/admin/vendedores/:id
 * POST   /api/admin/vendedores/:id/reset-password
 */
import { Router } from "express";
import { eq, and, sql, count } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db, usersTable, vendedoresTable, ordersTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { sendVendedorWelcomeEmail, sendTempPasswordEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router = Router();

/** Gera código de afiliado único de 6 chars */
function generateAffiliateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 8; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

// ── GET /admin/vendedores ────────────────────────────────────────────────────
router.get("/admin/vendedores", requireAdmin, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      cpfCnpj: usersTable.cpfCnpj,
      phone: usersTable.phone,
      isActive: usersTable.isActive,
      mustChangePassword: usersTable.mustChangePassword,
      createdAt: usersTable.createdAt,
      vendedorId: vendedoresTable.id,
      valorPorCert: vendedoresTable.valorPorCert,
      valorBonus: vendedoresTable.valorBonus,
      qtdCertsBonus: vendedoresTable.qtdCertsBonus,
      affiliateCode: vendedoresTable.affiliateCode,
    })
    .from(usersTable)
    .innerJoin(vendedoresTable, eq(vendedoresTable.userId, usersTable.id))
    .where(eq(usersTable.role, "vendedor"))
    .orderBy(usersTable.createdAt);

  // Para cada vendedor conta quantos contadores tem
  const result = await Promise.all(rows.map(async (row) => {
    const [{ total }] = await db
      .select({ total: count() })
      .from(usersTable)
      .where(eq(usersTable.vendedorId, row.id));
    return { ...row, totalContadores: Number(total) };
  }));

  res.json(result);
});

// ── POST /admin/vendedores ───────────────────────────────────────────────────
router.post("/admin/vendedores", requireAdmin, async (req, res): Promise<void> => {
  const { name, email, cpfCnpj, phone, valorPorCert, valorBonus, qtdCertsBonus } = req.body ?? {};
  if (!name || !email || !cpfCnpj) {
    res.status(400).json({ error: "Nome, e-mail e CPF/CNPJ são obrigatórios." });
    return;
  }
  const digits = String(cpfCnpj).replace(/\D/g, "");

  // Verifica duplicata
  const existing = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.cpfCnpj, digits))
    .limit(1);
  if (existing.length) { res.status(409).json({ error: "CPF/CNPJ já cadastrado." }); return; }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  // Gera código de afiliado único
  let affiliateCode = generateAffiliateCode();
  let attempts = 0;
  while (attempts < 10) {
    const dup = await db.select({ id: vendedoresTable.id })
      .from(vendedoresTable)
      .where(eq(vendedoresTable.affiliateCode, affiliateCode))
      .limit(1);
    if (!dup.length) break;
    affiliateCode = generateAffiliateCode();
    attempts++;
  }

  const [newUser] = await db.insert(usersTable).values({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    cpfCnpj: digits,
    passwordHash,
    role: "vendedor",
    userType: "cliente",
    phone: phone ? String(phone).replace(/\D/g, "") || null : null,
    isActive: true,
    emailVerified: true,
    mustChangePassword: true,
  }).returning({ id: usersTable.id });

  const [vendedor] = await db.insert(vendedoresTable).values({
    userId: newUser.id,
    valorPorCert: String(valorPorCert ?? "5.00"),
    valorBonus: String(valorBonus ?? "1000.00"),
    qtdCertsBonus: Number(qtdCertsBonus ?? 1000),
    affiliateCode,
  }).returning();

  // Envia email de boas-vindas com senha provisória
  if (email) {
    sendVendedorWelcomeEmail(email, name.trim(), tempPassword).catch(err =>
      logger.error({ err }, "Erro ao enviar email de boas-vindas ao vendedor")
    );
  }

  logger.info({ userId: newUser.id, affiliateCode }, "Vendedor criado");
  res.status(201).json({ userId: newUser.id, vendedorId: vendedor.id, affiliateCode });
});

// ── GET /admin/vendedores/:id ────────────────────────────────────────────────
router.get("/admin/vendedores/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(String(req.params.id));
  const [row] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      cpfCnpj: usersTable.cpfCnpj,
      phone: usersTable.phone,
      isActive: usersTable.isActive,
      mustChangePassword: usersTable.mustChangePassword,
      createdAt: usersTable.createdAt,
      vendedorId: vendedoresTable.id,
      valorPorCert: vendedoresTable.valorPorCert,
      valorBonus: vendedoresTable.valorBonus,
      qtdCertsBonus: vendedoresTable.qtdCertsBonus,
      affiliateCode: vendedoresTable.affiliateCode,
    })
    .from(usersTable)
    .innerJoin(vendedoresTable, eq(vendedoresTable.userId, usersTable.id))
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "vendedor")))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Vendedor não encontrado." }); return; }
  res.json(row);
});

// ── PATCH /admin/vendedores/:id ──────────────────────────────────────────────
router.patch("/admin/vendedores/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(String(req.params.id));
  const { name, email, phone, isActive, valorPorCert, valorBonus, qtdCertsBonus } = req.body ?? {};

  const userUpdates: Record<string, unknown> = {};
  if (name !== undefined) userUpdates.name = name.trim();
  if (email !== undefined) userUpdates.email = email.toLowerCase().trim();
  if (phone !== undefined) userUpdates.phone = phone ? String(phone).replace(/\D/g, "") || null : null;
  if (isActive !== undefined) userUpdates.isActive = isActive;

  if (Object.keys(userUpdates).length) {
    await db.update(usersTable).set(userUpdates as never).where(eq(usersTable.id, id));
  }

  const vendedorUpdates: Record<string, unknown> = {};
  if (valorPorCert !== undefined) vendedorUpdates.valorPorCert = String(valorPorCert);
  if (valorBonus !== undefined) vendedorUpdates.valorBonus = String(valorBonus);
  if (qtdCertsBonus !== undefined) vendedorUpdates.qtdCertsBonus = Number(qtdCertsBonus);

  if (Object.keys(vendedorUpdates).length) {
    await db.update(vendedoresTable).set(vendedorUpdates as never).where(eq(vendedoresTable.userId, id));
  }

  const [row] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      isActive: usersTable.isActive,
      valorPorCert: vendedoresTable.valorPorCert,
      valorBonus: vendedoresTable.valorBonus,
      qtdCertsBonus: vendedoresTable.qtdCertsBonus,
      affiliateCode: vendedoresTable.affiliateCode,
    })
    .from(usersTable)
    .innerJoin(vendedoresTable, eq(vendedoresTable.userId, usersTable.id))
    .where(eq(usersTable.id, id))
    .limit(1);

  res.json(row ?? { id });
});

// ── DELETE /admin/vendedores/:id ─────────────────────────────────────────────
router.delete("/admin/vendedores/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(String(req.params.id));
  // Remove vínculo dos contadores
  await db.update(usersTable).set({ vendedorId: null }).where(eq(usersTable.vendedorId, id));
  await db.delete(vendedoresTable).where(eq(vendedoresTable.userId, id));
  await db.update(usersTable).set({ role: "contador", isActive: false }).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

// ── POST /admin/vendedores/:id/reset-password ────────────────────────────────
router.post("/admin/vendedores/:id/reset-password", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(String(req.params.id));
  const [user] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) { res.status(404).json({ error: "Vendedor não encontrado." }); return; }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await db.update(usersTable).set({ passwordHash, mustChangePassword: true }).where(eq(usersTable.id, id));

  if (user.email) {
    sendTempPasswordEmail(user.email, user.name, tempPassword).catch(err =>
      logger.error({ err }, "Erro ao enviar email de reset para vendedor")
    );
  }

  res.json({ message: "Senha redefinida e e-mail enviado.", tempPassword });
});

export default router;
