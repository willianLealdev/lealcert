import { Router } from "express";
import { and, eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db, pool, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { sendOperatorCredentialsEmail } from "../lib/email";

const router = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function temporaryPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes, byte => chars[byte % chars.length]).join("");
}

async function currentContador(userId: number) {
  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, userType: usersTable.userType, isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user || !user.isActive || user.role !== "contador" || user.userType !== "contador") return null;
  return user;
}

function operatorResponse(operator: typeof usersTable.$inferSelect) {
  return {
    id: operator.id,
    name: operator.name,
    email: operator.email,
    cpfCnpj: operator.cpfCnpj,
    isActive: operator.isActive,
    mustChangePassword: operator.mustChangePassword,
    createdAt: operator.createdAt,
  };
}

router.get("/operators", requireAuth, async (req, res): Promise<void> => {
  const contador = await currentContador(req.session.userId as number);
  if (!contador) {
    res.status(403).json({ error: "Acesso exclusivo para contadores." });
    return;
  }

  const operators = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.role, "operador"), eq(usersTable.contadorId, contador.id)))
    .orderBy(usersTable.name);
  res.json(operators.map(operatorResponse));
});

router.post("/operators", requireAuth, async (req, res): Promise<void> => {
  const contador = await currentContador(req.session.userId as number);
  if (!contador) {
    res.status(403).json({ error: "Apenas a conta do contador pode cadastrar operadores." });
    return;
  }

  const { name, email, cpfCnpj } = req.body ?? {};
  const normalizedName = String(name ?? "").trim();
  const cpf = String(cpfCnpj ?? "").replace(/\D/g, "");
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!normalizedName || normalizedName.length > 150 || !EMAIL_PATTERN.test(normalizedEmail) || cpf.length !== 11) {
    res.status(400).json({ error: "Informe nome, CPF válido e e-mail do operador." });
    return;
  }

  const [duplicate] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(or(eq(usersTable.cpfCnpj, cpf), eq(usersTable.email, normalizedEmail)))
    .limit(1);
  if (duplicate) {
    res.status(409).json({ error: "Já existe um cadastro com este CPF ou e-mail." });
    return;
  }

  const password = temporaryPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const [operator] = await db.insert(usersTable).values({
    name: normalizedName,
    email: normalizedEmail,
    cpfCnpj: cpf,
    passwordHash,
    role: "operador",
    // A regra comercial é deliberadamente a de contador; a identidade é o role.
    userType: "contador",
    contadorId: contador.id,
    isActive: true,
    emailVerified: true,
    mustChangePassword: true,
  }).returning();

  try {
    await sendOperatorCredentialsEmail({
      to: normalizedEmail,
      name: operator.name,
      contadorName: contador.name,
      tempPassword: password,
    });
  } catch (err) {
    req.log.error({ err, operatorId: operator.id }, "Falha ao enviar credenciais do operador");
  }

  res.status(201).json(operatorResponse(operator));
});

router.patch("/operators/:id", requireAuth, async (req, res): Promise<void> => {
  const contador = await currentContador(req.session.userId as number);
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!contador) {
    res.status(403).json({ error: "Acesso exclusivo para contadores." });
    return;
  }
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Operador inválido." });
    return;
  }

  const { isActive } = req.body ?? {};
  if (typeof isActive !== "boolean") {
    res.status(400).json({ error: "Informe o novo status do operador." });
    return;
  }
  const [operator] = await db
    .update(usersTable)
    .set({ isActive })
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "operador"), eq(usersTable.contadorId, contador.id)))
    .returning();
  if (!operator) {
    res.status(404).json({ error: "Operador não encontrado." });
    return;
  }
  res.json(operatorResponse(operator));
});

router.post("/operators/:id/reset-password", requireAuth, async (req, res): Promise<void> => {
  const contador = await currentContador(req.session.userId as number);
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!contador) {
    res.status(403).json({ error: "Acesso exclusivo para contadores." });
    return;
  }
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Operador inválido." });
    return;
  }

  const [operator] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "operador"), eq(usersTable.contadorId, contador.id)))
    .limit(1);
  if (!operator || !operator.email) {
    res.status(404).json({ error: "Operador não encontrado ou sem e-mail cadastrado." });
    return;
  }

  const password = temporaryPassword();
  await db.update(usersTable)
    .set({ passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true })
    .where(eq(usersTable.id, operator.id));
  try {
    await sendOperatorCredentialsEmail({
      to: operator.email,
      name: operator.name,
      contadorName: contador.name,
      tempPassword: password,
      isReset: true,
    });
  } catch (err) {
    req.log.error({ err, operatorId: operator.id }, "Falha ao enviar reset do operador");
    res.status(502).json({ error: "A senha foi renovada, mas não foi possível enviar o e-mail. Verifique o SMTP." });
    return;
  }
  res.json({ message: "Nova senha provisória enviada ao e-mail do operador." });
});

router.delete("/operators/:id", requireAuth, async (req, res): Promise<void> => {
  const contador = await currentContador(req.session.userId as number);
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!contador) {
    res.status(403).json({ error: "Acesso exclusivo para contadores." });
    return;
  }
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Operador inválido." });
    return;
  }

  const [operator] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "operador"), eq(usersTable.contadorId, contador.id)))
    .limit(1);
  if (!operator) {
    res.status(404).json({ error: "Operador não encontrado." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE orders SET operator_id = NULL WHERE operator_id = $1", [id]);
    await client.query("DELETE FROM messages WHERE ticket_id IN (SELECT id FROM tickets WHERE user_id = $1)", [id]);
    await client.query("DELETE FROM tickets WHERE user_id = $1", [id]);
    await client.query("DELETE FROM push_subscriptions WHERE user_id = $1", [id]);
    await client.query("DELETE FROM ip_verifications WHERE user_id = $1", [id]);
    await client.query("DELETE FROM ip_logs WHERE user_id = $1", [id]);
    await client.query("DELETE FROM users WHERE id = $1", [id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  res.sendStatus(204);
});

export default router;