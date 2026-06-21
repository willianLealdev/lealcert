import { Router } from "express";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db, usersTable, ipVerificationsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { sendVerificationEmail, sendWelcomeEmail, sendTempPasswordEmail, sendIpVerificationEmail } from "../lib/email";
import {
  getClientIp, checkIpStatus, recordLoginAttempt, recordRegisterIp,
  handleFailedLogin, clearFailedAttempts, isIpTrusted, addTrustedIp,
  generateIpVerificationCode,
} from "../lib/ip-security";

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

// ── GET /auth/csrf-token — backend-generated CSRF token ──────────────────────
// The frontend must call this endpoint and include the returned token in the
// X-CSRF-Token header on every state-changing request.
router.get("/auth/csrf-token", (req, res): void => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString("hex");
  }
  res.json({ csrfToken: req.session.csrfToken });
});

// ── Normaliza número CRC para formato da API do CFC: SP100000O ───────────────
function normalizeCrc(input: string): string {
  let s = input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  // CRC sempre termina com letra de tipo (O, P, T…). Se terminar com "0" (zero),
  // converte para "O" (letra), pois é confusão visual frequente.
  if (s.length > 2 && s[s.length - 1] === "0") {
    s = s.slice(0, -1) + "O";
  }
  return s;
}

// ── Consulta API do CFC ───────────────────────────────────────────────────────
interface CfcProfissional {
  Nome?: string;
  Cpf?: string;
  NumeroRegistro?: string;
  SituacaoCadastral?: string;
  Categoria?: string;
  Crc?: string;
}

async function consultarCfc(identifier: string): Promise<CfcProfissional | null> {
  try {
    const url = `https://sistemas.cfc.org.br/servico/api/Profissional/${encodeURIComponent(identifier)}/teste`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const data = await resp.json() as CfcProfissional[];
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch {
    return null;
  }
}

// ── GET /auth/lookup-crc?cpfCnpj=XXX — busca por CPF ou CNPJ ─────────────────
router.get("/auth/lookup-crc", async (req, res): Promise<void> => {
  const cpfCnpj = String(req.query.cpfCnpj ?? "").replace(/\D/g, "");
  if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
    res.status(400).json({ error: "CPF ou CNPJ inválido." });
    return;
  }
  const prof = await consultarCfc(cpfCnpj);
  if (!prof || !prof.Nome) {
    res.json({ found: false });
    return;
  }
  const ativo = prof.SituacaoCadastral?.toLowerCase() === "ativo";
  res.json({
    found: true,
    valid: ativo,
    nome: prof.Nome?.trim() ?? null,
    crc: prof.Crc ?? null,
    numeroRegistro: prof.NumeroRegistro ?? null,
    situacao: prof.SituacaoCadastral ?? null,
    categoria: prof.Categoria ?? null,
  });
});

// ── GET /auth/validate-crc?crc=SP100000O ─────────────────────────────────────
router.get("/auth/validate-crc", async (req, res): Promise<void> => {
  const crcRaw = String(req.query.crc ?? "").trim();
  if (!crcRaw) {
    res.status(400).json({ error: "Parâmetro crc é obrigatório." });
    return;
  }
  const crcNorm = normalizeCrc(crcRaw);
  // Formato mínimo: 2 letras UF + pelo menos 1 dígito + 1 letra tipo
  if (!/^[A-Z]{2}\d+[A-Z]$/.test(crcNorm)) {
    res.status(400).json({ error: "Formato inválido. Use UF + número + tipo, ex: SP100000O" });
    return;
  }
  const prof = await consultarCfc(crcNorm);
  if (!prof) {
    res.json({ valid: false, situacao: "Não encontrado", nome: null, numeroRegistro: null, categoria: null, crc: null });
    return;
  }
  const ativo = prof.SituacaoCadastral?.toLowerCase() === "ativo";
  res.json({
    valid: ativo,
    situacao: prof.SituacaoCadastral ?? "Desconhecido",
    nome: prof.Nome?.trim() ?? null,
    numeroRegistro: prof.NumeroRegistro ?? null,
    categoria: prof.Categoria ?? null,
    crc: prof.Crc ?? null,
  });
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const { name, email, cpfCnpj, password, phone, userType, crcNumber } = req.body ?? {};
  if (!name || !email || !cpfCnpj || !password) {
    res.status(400).json({ error: "Nome, e-mail, CPF/CNPJ e senha são obrigatórios." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "A senha deve ter no mínimo 8 caracteres." });
    return;
  }
  const resolvedUserType = userType === "contador" ? "contador" : "cliente";

  // ── Validação CRC obrigatória para contadores ─────────────────────────────
  let crcNorm: string | null = null;
  let crcVerifiedFlag = false;
  if (resolvedUserType === "contador") {
    if (!crcNumber) {
      res.status(400).json({ error: "Número de registro CRC é obrigatório para contadores." });
      return;
    }
    crcNorm = normalizeCrc(String(crcNumber));
    if (!/^[A-Z]{2}\d+[A-Z]$/.test(crcNorm)) {
      res.status(400).json({ error: "Formato de CRC inválido. Use UF + número + tipo, ex: SP100000O" });
      return;
    }
    const prof = await consultarCfc(crcNorm);
    if (!prof) {
      // API indisponível — permite cadastro mas marca como não verificado
      logger.warn({ crcNorm }, "CFC API unavailable during registration, crcVerified=false");
    } else if (prof.SituacaoCadastral?.toLowerCase() !== "ativo") {
      res.status(422).json({ error: `Registro CRC não está ativo. Situação: ${prof.SituacaoCadastral ?? "Desconhecido"}. Apenas profissionais ativos podem se cadastrar como contadores.` });
      return;
    } else {
      crcVerifiedFlag = true;
    }
  }

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
  const clientIp = getClientIp(req as Parameters<typeof getClientIp>[0]);
  const [newUser] = await db.insert(usersTable).values({
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
    crcNumber: crcNorm,
    crcVerified: crcVerifiedFlag,
    registrationIp: clientIp,
    trustedIps: [clientIp],
  }).returning({ id: usersTable.id });
  if (newUser) recordRegisterIp(clientIp, newUser.id, digits).catch(() => {});
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

  // Regenerate session to prevent session fixation
  const userData = { ...user, emailVerified: true, emailVerificationCode: null, emailVerificationExpiresAt: null };
  req.session.regenerate((err) => {
    if (err) {
      logger.error({ err }, "Session regeneration failed after verify-email");
      res.status(500).json({ error: "Erro interno ao iniciar sessão." });
      return;
    }
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.userType = user.userType;
    res.json(userResponse(userData));
  });
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

  const clientIp = getClientIp(req as Parameters<typeof getClientIp>[0]);

  // ── 1. Verificar se IP está banido ou bloqueado ───────────────────────────
  const ipStatus = await checkIpStatus(clientIp);
  if (ipStatus.status === "banned") {
    await recordLoginAttempt({ ip: clientIp, cpfCnpj, success: false, blocked: true });
    res.status(403).json({
      error: "Seu IP foi permanentemente banido. Entre em contato com o suporte para contestar.",
      code: "ip_banned",
    });
    return;
  }
  if (ipStatus.status === "blocked") {
    await recordLoginAttempt({ ip: clientIp, cpfCnpj, success: false, blocked: true });
    res.status(423).json({
      error: ipStatus.isForeign
        ? "Acesso bloqueado por IP suspeito (origem estrangeira). Abra um chamado de suporte para desbloquear."
        : "IP bloqueado temporariamente por excesso de tentativas. Abra um chamado ou aguarde até 4 horas.",
      code: "ip_blocked",
      isForeign: ipStatus.isForeign,
      unblockAt: ipStatus.unblockAt,
    });
    return;
  }

  const digits = cpfCnpj.replace(/\D/g, "");
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.cpfCnpj, digits))
    .limit(1);

  if (!user) {
    await bcrypt.compare(password, "$2a$10$invalidhashfortimingprotection00000000000000000000000");
    await handleFailedLogin(clientIp, digits);
    await recordLoginAttempt({ ip: clientIp, cpfCnpj: digits, success: false });
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

  // ── 2. Validar senha ──────────────────────────────────────────────────────
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const nowBlocked = await handleFailedLogin(clientIp, digits);
    await recordLoginAttempt({ ip: clientIp, cpfCnpj: digits, userId: user.id, success: false, blocked: nowBlocked });
    if (nowBlocked) {
      const freshStatus = await checkIpStatus(clientIp);
      res.status(423).json({
        error: "IP bloqueado após múltiplas tentativas incorretas. Abra um chamado ou aguarde até 4 horas.",
        code: "ip_blocked",
        isForeign: freshStatus.status === "blocked" ? freshStatus.isForeign : false,
      });
    } else {
      res.status(401).json({ error: "CPF/CNPJ ou senha inválidos." });
    }
    return;
  }

  // ── 3. Login bem-sucedido — limpar tentativas ─────────────────────────────
  await clearFailedAttempts(clientIp);
  await recordLoginAttempt({ ip: clientIp, cpfCnpj: digits, userId: user.id, success: true });

  // ── 4. Verificar se IP é confiável ────────────────────────────────────────
  const trusted = await isIpTrusted(user.id, clientIp);
  if (!trusted && user.email) {
    // IP diferente do cadastrado — enviar código de verificação por e-mail
    const code = generateIpVerificationCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos
    await db.insert(ipVerificationsTable).values({
      userId: user.id,
      ip: clientIp,
      code,
      expiresAt,
    });
    try {
      await sendIpVerificationEmail(user.email, user.name, code);
    } catch (err) {
      logger.error({ err }, "Falha ao enviar e-mail de verificação de IP");
    }
    res.status(202).json({ requiresIpVerification: true });
    return;
  }

  // ── 5. Criar sessão ───────────────────────────────────────────────────────
  const userData = userResponse(user);
  req.session.regenerate((err) => {
    if (err) {
      logger.error({ err }, "Session regeneration failed after login");
      res.status(500).json({ error: "Erro interno ao iniciar sessão." });
      return;
    }
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.userType = user.userType;
    req.session.save((saveErr) => {
      if (saveErr) {
        logger.error({ err: saveErr }, "Session save failed after login");
        res.status(500).json({ error: "Erro interno ao salvar sessão." });
        return;
      }
      res.json(userData);
    });
  });
});

// ── POST /auth/verify-ip — Validar código de verificação de IP novo ───────────
router.post("/auth/verify-ip", async (req, res): Promise<void> => {
  const { cpfCnpj, code } = req.body ?? {};
  if (!cpfCnpj || !code) {
    res.status(400).json({ error: "CPF/CNPJ e código são obrigatórios." });
    return;
  }
  const clientIp = getClientIp(req as Parameters<typeof getClientIp>[0]);
  const digits = cpfCnpj.replace(/\D/g, "");

  const [user] = await db.select().from(usersTable).where(eq(usersTable.cpfCnpj, digits)).limit(1);
  if (!user) {
    res.status(400).json({ error: "Código inválido ou expirado." });
    return;
  }

  const now = new Date();
  const [verification] = await db
    .select()
    .from(ipVerificationsTable)
    .where(
      eq(ipVerificationsTable.userId, user.id),
    )
    .orderBy(ipVerificationsTable.createdAt)
    .limit(1);

  if (
    !verification ||
    verification.ip !== clientIp ||
    verification.code !== String(code).trim() ||
    verification.usedAt ||
    verification.expiresAt < now
  ) {
    res.status(400).json({ error: "Código inválido ou expirado. Tente fazer login novamente." });
    return;
  }

  // Marcar como usado e adicionar IP à lista de confiáveis
  await db.update(ipVerificationsTable).set({ usedAt: now }).where(eq(ipVerificationsTable.id, verification.id));
  await addTrustedIp(user.id, clientIp);
  await recordLoginAttempt({ ip: clientIp, cpfCnpj: digits, userId: user.id, success: true });

  const userData = userResponse(user);
  req.session.regenerate((err) => {
    if (err) {
      res.status(500).json({ error: "Erro interno ao iniciar sessão." });
      return;
    }
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.userType = user.userType;
    req.session.save((saveErr) => {
      if (saveErr) {
        res.status(500).json({ error: "Erro interno ao salvar sessão." });
        return;
      }
      res.json(userData);
    });
  });
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
  if (newPassword.length < 8) {
    res.status(400).json({ error: "A nova senha deve ter no mínimo 8 caracteres." });
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
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Erro ao encerrar sessão." });
      return;
    }
    res.clearCookie("sess");
    res.json({ ok: true });
  });
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
    if (newPassword.length < 8) {
      res.status(400).json({ error: "A nova senha deve ter no mínimo 8 caracteres." });
      return;
    }
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
