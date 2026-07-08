import { Router } from "express";
import { eq, or, and, not, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db, usersTable, ipVerificationsTable, settingsTable, ticketsTable, messagesTable } from "@workspace/db";
import { swConsultaCPF } from "../lib/safeweb";
import { logger } from "../lib/logger";
import { sendVerificationEmail, sendWelcomeEmail, sendTempPasswordEmail, sendIpVerificationEmail } from "../lib/email";
import { sendWaText } from "../lib/notify";
import {
  getClientIp, checkIpStatus, recordLoginAttempt, recordRegisterIp,
  handleFailedLogin, clearFailedAttempts, isIpTrusted, addTrustedIp,
  generateIpVerificationCode,
} from "../lib/ip-security";

// ── Bloqueio por CPF/CNPJ (brute-force por documento) ───────────────────────
const CPF_MAX_ATTEMPTS = 5;
const CPF_WINDOW_MS = 15 * 60 * 1000;    // 15 min
const CPF_BLOCK_MS   = 15 * 60 * 1000;   // 15 min de bloqueio

interface CpfAttemptEntry { count: number; windowStart: number; blockedUntil: number }
const cpfAttempts = new Map<string, CpfAttemptEntry>();

function checkCpfBlock(digits: string): { blocked: boolean; unblockAt?: Date } {
  const entry = cpfAttempts.get(digits);
  if (!entry) return { blocked: false };
  if (Date.now() < entry.blockedUntil) return { blocked: true, unblockAt: new Date(entry.blockedUntil) };
  if (Date.now() - entry.windowStart > CPF_WINDOW_MS) {
    cpfAttempts.delete(digits);
    return { blocked: false };
  }
  return { blocked: false };
}

function recordCpfFailure(digits: string): boolean {
  const now = Date.now();
  const entry = cpfAttempts.get(digits);
  if (!entry || now - entry.windowStart > CPF_WINDOW_MS) {
    cpfAttempts.set(digits, { count: 1, windowStart: now, blockedUntil: 0 });
    return false;
  }
  entry.count++;
  if (entry.count >= CPF_MAX_ATTEMPTS) {
    entry.blockedUntil = now + CPF_BLOCK_MS;
    return true;
  }
  return false;
}

function clearCpfAttempts(digits: string) {
  cpfAttempts.delete(digits);
}

// ── Validação de CPF e CNPJ (dígitos verificadores) ─────────────────────────
function validarCpf(digits: string): boolean {
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // todos iguais (000...000)
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let r = sum % 11;
  const d1 = r < 2 ? 0 : 11 - r;
  if (d1 !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  r = sum % 11;
  const d2 = r < 2 ? 0 : 11 - r;
  return d2 === parseInt(digits[10]);
}

function validarCnpj(digits: string): boolean {
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false; // todos iguais
  const calc = (n: number) => {
    const weights = n === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + parseInt(digits[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === parseInt(digits[12]) && calc(13) === parseInt(digits[13]);
}

function validarCpfCnpj(digits: string): boolean {
  if (digits.length === 11) return validarCpf(digits);
  if (digits.length === 14) return validarCnpj(digits);
  return false;
}

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
    personType: user.personType ?? null,
    mustChangePassword: user.mustChangePassword,
    phone: user.phone,
    crcNumber: user.crcNumber ?? null,
    companyName: user.companyName ?? null,
    companyFantasyName: user.companyFantasyName ?? null,
    responsibleCpf: user.responsibleCpf ?? null,
    responsibleName: user.responsibleName ?? null,
    zipCode: user.zipCode ?? null,
    street: user.street ?? null,
    addressNumber: user.addressNumber ?? null,
    complement: user.complement ?? null,
    neighborhood: user.neighborhood ?? null,
    city: user.city ?? null,
    addressState: user.addressState ?? null,
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
    logger.info({ identifier, status: resp.status }, "consultarCfc: resposta CFC");
    if (!resp.ok) return null;
    const data = await resp.json() as CfcProfissional[];
    logger.info({ identifier, count: Array.isArray(data) ? data.length : "not-array", first: Array.isArray(data) ? data[0] : data }, "consultarCfc: dados CFC");
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (err) {
    logger.warn({ identifier, err }, "consultarCfc: erro");
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
  const situacaoLower = prof.SituacaoCadastral?.toLowerCase() ?? "";
  const ativo = ["ativo", "regular", "adimplente"].some(s => situacaoLower.includes(s));
  res.json({
    found: true,
    valid: ativo,
    nome: prof.Nome?.trim() ?? null,
    crc: prof.NumeroRegistro ? normalizeCrc(prof.NumeroRegistro) : null,
    numeroRegistro: prof.NumeroRegistro ?? null,
    situacao: prof.SituacaoCadastral ?? null,
    categoria: prof.Categoria ?? null,
  });
});

// ── GET /auth/validate-crc?crc=SP100000O ─────────────────────────────────────
router.get("/auth/validate-crc", async (req, res): Promise<void> => {
  const crcRaw = String(req.query.crc ?? "").trim().toUpperCase();
  if (!crcRaw) {
    res.status(400).json({ error: "Parâmetro crc é obrigatório." });
    return;
  }
  const crcNorm = normalizeCrc(crcRaw);
  if (crcNorm.length < 4 || !/^[A-Z]{2}/.test(crcNorm)) {
    res.status(400).json({ error: "Formato inválido. Use UF + número + tipo, ex: SP100000O" });
    return;
  }

  // Monta lista de formatos a tentar, do mais específico ao mais genérico:
  // 1) valor original digitado (ex: SP-022951/O)
  // 2) normalizado sem formatação (ex: SP022951O)
  // 3) normalizado com swap O↔0 (ex: SP0229510)
  const candidates: string[] = [];
  candidates.push(crcRaw); // original com formatação
  if (!candidates.includes(crcNorm)) candidates.push(crcNorm);
  const swapped = crcNorm.endsWith("O")
    ? crcNorm.slice(0, -1) + "0"
    : crcNorm.endsWith("0")
      ? crcNorm.slice(0, -1) + "O"
      : null;
  if (swapped && !candidates.includes(swapped)) candidates.push(swapped);

  let prof: CfcProfissional | null = null;
  for (const candidate of candidates) {
    prof = await consultarCfc(candidate);
    if (prof) break;
  }

  if (!prof) {
    res.json({ valid: false, situacao: "Não encontrado no CFC", nome: null, numeroRegistro: null, categoria: null, crc: null });
    return;
  }
  const situacaoLower = prof.SituacaoCadastral?.toLowerCase() ?? "";
  const ativo = ["ativo", "regular", "adimplente"].some(s => situacaoLower.includes(s));
  res.json({
    valid: ativo,
    situacao: prof.SituacaoCadastral ?? "Desconhecido",
    nome: prof.Nome?.trim() ?? null,
    numeroRegistro: prof.NumeroRegistro ?? null,
    categoria: prof.Categoria ?? null,
    crc: prof.NumeroRegistro ? normalizeCrc(prof.NumeroRegistro) : null,
  });
});

// ── GET /auth/lookup-cpf?cpf=XXX&birthDate=DD/MM/YYYY — consulta prévia Safeweb ──
router.get("/auth/lookup-cpf", async (req, res): Promise<void> => {
  const cpf = String(req.query.cpf ?? "").replace(/\D/g, "");
  const birthDate = String(req.query.birthDate ?? "").trim();
  if (cpf.length !== 11) { res.status(400).json({ error: "CPF inválido." }); return; }
  if (!birthDate) { res.status(400).json({ error: "Data de nascimento obrigatória." }); return; }
  try {
    const [s] = await db.select().from(settingsTable).limit(1);
    const isHomol = s?.safewebAmbiente === "homologacao";
    const username = isHomol ? (s?.safewebUsernameHomologacao ?? s?.safewebUsername) : s?.safewebUsername;
    const password = isHomol ? (s?.safewebPasswordHomologacao ?? s?.safewebPassword) : s?.safewebPassword;
    const rawUrl = (isHomol ? s?.safewebUrlHomologacao : s?.safewebUrl) ?? s?.safewebUrl;
    if (!username || !password || !rawUrl) {
      res.json({ found: false, error: "Safeweb não configurado" });
      return;
    }
    const swUrl = (() => { try { return new URL(rawUrl).origin; } catch { return rawUrl.replace(/\/Service\/.+$/, "").replace(/\/$/, ""); } })();
    // Safeweb não aceita DD/MM/YYYY — converte para YYYY-MM-DD igual ao fluxo de pedidos
    const dateForSw = birthDate.includes("/")
      ? (() => { const [d, m, y] = birthDate.split("/"); return y && m && d ? `${y}-${m}-${d}` : birthDate; })()
      : birthDate;
    const result = await swConsultaCPF({ url: swUrl, username, password }, cpf, dateForSw);
    logger.info({ codigo: result.Codigo, mensagem: result.Mensagem, temNome: !!result.NomeCompleto }, "lookup-cpf: resposta Safeweb");
    // Safeweb pode retornar o nome em NomeCompleto OU em Mensagem (quando Codigo === 0)
    const nome = result.NomeCompleto
      || (result.Codigo === 0 && typeof result.Mensagem === "string" && result.Mensagem.length > 2 ? result.Mensagem : null);
    if (nome) {
      res.json({ found: true, nome });
    } else {
      res.json({ found: false, mensagem: result.Mensagem ?? "Não encontrado", codigo: result.Codigo });
    }
  } catch (err) {
    logger.warn({ err }, "lookup-cpf: erro na consulta Safeweb");
    res.json({ found: false, error: "Erro na consulta" });
  }
});

// ── GET /auth/lookup-cnpj?cnpj=XXX — dados da empresa via BrasilAPI ───────────
router.get("/auth/lookup-cnpj", async (req, res): Promise<void> => {
  const cnpj = String(req.query.cnpj ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14) {
    res.status(400).json({ error: "CNPJ inválido." });
    return;
  }
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "LealCert/1.0" },
    });
    if (!resp.ok) { res.json({ found: false }); return; }
    const data = await resp.json() as Record<string, unknown>;
    res.json({
      found: true,
      razaoSocial: data.razao_social ?? null,
      nomeFantasia: data.nome_fantasia ?? null,
      cep: String(data.cep ?? "").replace(/\D/g, "") || null,
      logradouro: data.logradouro ?? null,
      numero: data.numero ?? null,
      complemento: data.complemento ?? null,
      bairro: data.bairro ?? null,
      municipio: data.municipio ?? null,
      uf: data.uf ?? null,
    });
  } catch {
    res.json({ found: false });
  }
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const {
    name, email, cpfCnpj, password, phone, userType,
    personType,
    crcNumber,
    companyName, companyFantasyName,
    responsibleCpf, responsibleName,
    zipCode, street, addressNumber, complement, neighborhood, city, addressState,
  } = req.body ?? {};
  if (!name || !email || !cpfCnpj || !password) {
    res.status(400).json({ error: "Nome, e-mail, CPF/CNPJ e senha são obrigatórios." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "A senha deve ter no mínimo 8 caracteres." });
    return;
  }
  const resolvedUserType = userType === "contador" ? "contador" : "cliente";
  const resolvedPersonType = personType === "juridica" ? "juridica" : "fisica";

  // ── Validação CRC: obrigatória para contador (PF e PJ) ───────────────────
  let crcNorm: string | null = null;
  let crcVerifiedFlag = false;

  if (resolvedUserType === "contador" && resolvedPersonType === "fisica") {
    // PF: valida o próprio CRC do contador
    if (!crcNumber) {
      res.status(400).json({ error: "Número de registro CRC é obrigatório para contadores pessoa física." });
      return;
    }
    crcNorm = normalizeCrc(String(crcNumber));
    if (!/^[A-Z]{2}\d+[A-Z]$/.test(crcNorm)) {
      res.status(400).json({ error: "Formato de CRC inválido. Use UF + número + tipo, ex: SP100000O" });
      return;
    }
    const prof = await consultarCfc(crcNorm);
    if (!prof) {
      logger.warn({ crcNorm }, "CFC API unavailable during registration, crcVerified=false");
    } else if (prof.SituacaoCadastral?.toLowerCase() !== "ativo") {
      res.status(422).json({ error: `Registro CRC não está ativo. Situação: ${prof.SituacaoCadastral ?? "Desconhecido"}.` });
      return;
    } else {
      crcVerifiedFlag = true;
    }
  }

  if (resolvedUserType === "contador" && resolvedPersonType === "juridica") {
    // PJ: valida o CRC do responsável técnico — obrigatório e deve estar ativo
    if (!responsibleCpf) {
      res.status(400).json({ error: "O CPF do responsável técnico é obrigatório para o cadastro de escritórios contábeis." });
      return;
    }
    const respDigits = String(responsibleCpf).replace(/\D/g, "");
    const prof = await consultarCfc(respDigits);
    if (!prof) {
      res.status(503).json({ error: "Não foi possível verificar o CRC do responsável técnico junto ao CFC. Tente novamente em instantes." });
      return;
    }
    if (prof.SituacaoCadastral?.toLowerCase() !== "ativo") {
      res.status(422).json({ error: `O CRC do responsável técnico não está ativo no CFC. Situação: ${prof.SituacaoCadastral ?? "Desconhecido"}. Apenas escritórios com profissional ativo podem se cadastrar.` });
      return;
    }
    crcNorm = prof.NumeroRegistro ? normalizeCrc(prof.NumeroRegistro) : null;
    crcVerifiedFlag = true;
  }

  // ── Verificação de CRC duplicado ──────────────────────────────────────────
  if (crcNorm) {
    const existingCrc = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.crcNumber, crcNorm))
      .limit(1);
    if (existingCrc.length > 0) {
      res.status(409).json({
        error: "Este CRC já está vinculado a outro cadastro na plataforma. Se você acredita que isso é um erro, abra um chamado pelo chat de suporte.",
        crcDuplicate: true,
      });
      return;
    }
  }

  const digits = cpfCnpj.replace(/\D/g, "");
  if (!validarCpfCnpj(digits)) {
    res.status(400).json({ error: "CPF ou CNPJ inválido. Verifique os dígitos digitados." });
    return;
  }
  const existingRows = await db
    .select({ id: usersTable.id, cpfCnpj: usersTable.cpfCnpj, email: usersTable.email, phone: usersTable.phone })
    .from(usersTable)
    .where(or(
      eq(usersTable.cpfCnpj, digits),
      eq(usersTable.email, email.toLowerCase().trim()),
      ...(phone ? [eq(usersTable.phone, String(phone).replace(/\D/g, ""))] : []),
    ));
  for (const row of existingRows) {
    if (row.cpfCnpj === digits) {
      res.status(409).json({ error: "CPF/CNPJ já cadastrado." });
      return;
    }
    if (row.email === email.toLowerCase().trim()) {
      res.status(409).json({ error: "Este e-mail já está cadastrado em outra conta." });
      return;
    }
    if (phone && row.phone === String(phone).replace(/\D/g, "")) {
      res.status(409).json({ error: "Este telefone já está cadastrado em outra conta." });
      return;
    }
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
    personType: resolvedPersonType,
    isActive: true,
    emailVerified: false,
    emailVerificationCode: code,
    emailVerificationExpiresAt: expiresAt,
    crcNumber: crcNorm,
    crcVerified: crcVerifiedFlag,
    companyName: companyName?.trim() || null,
    companyFantasyName: companyFantasyName?.trim() || null,
    responsibleCpf: responsibleCpf ? String(responsibleCpf).replace(/\D/g, "") || null : null,
    responsibleName: responsibleName?.trim() || null,
    zipCode: zipCode ? String(zipCode).replace(/\D/g, "") || null : null,
    street: street?.trim() || null,
    addressNumber: addressNumber?.trim() || null,
    complement: complement?.trim() || null,
    neighborhood: neighborhood?.trim() || null,
    city: city?.trim() || null,
    addressState: addressState?.trim() || null,
    registrationIp: clientIp,
    trustedIps: [clientIp],
  }).returning({ id: usersTable.id });
  if (newUser) recordRegisterIp(clientIp, newUser.id, digits).catch(() => {});
  try {
    await sendVerificationEmail(email, name, code);
  } catch (err) {
    logger.error({ err }, "Failed to send verification email");
  }
  if (phone) {
    sendWaText(phone, `*LealCert — Ative sua conta* 🔐\n\nOlá, ${name.trim()}!\n\nSeu código de ativação é: *${code}*\n\nEle expira em 30 minutos. Insira-o na tela de verificação para liberar seu acesso.`).catch(() => {});
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
  if (user.phone) {
    const isCliente = user.userType === "cliente";
    const waMsg = isCliente
      ? `*Bem-vindo à LealCert!* 🎉\n\nOlá, ${user.name}! Sua conta foi ativada com sucesso.\n\n🎁 *Presente especial:* use o cupom *BEMVINDO* no seu primeiro pedido e ganhe *10% de desconto*!\n\nAcesse o painel e solicite seu certificado digital.`
      : `*Bem-vindo à LealCert!* 🎉\n\nOlá, ${user.name}! Sua conta de contador foi ativada com sucesso.\n\nJá pode acessar o painel e gerenciar certificados digitais para seus clientes.`;
    sendWaText(user.phone, waMsg).catch(() => {});
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
  if (user.phone) {
    sendWaText(user.phone, `*LealCert — Código de ativação* 🔐\n\nSeu novo código é: *${code}*\n\nEle expira em 30 minutos.`).catch(() => {});
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
  const loginDigits = cpfCnpj.replace(/\D/g, "");

  // ── 0. Verificar bloqueio por CPF/CNPJ ───────────────────────────────────
  const cpfBlock = checkCpfBlock(loginDigits);
  if (cpfBlock.blocked) {
    res.status(423).json({
      error: "CPF/CNPJ bloqueado temporariamente por excesso de tentativas. Aguarde 15 minutos.",
      code: "cpf_blocked",
      unblockAt: cpfBlock.unblockAt,
    });
    return;
  }

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

  const digits = loginDigits;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.cpfCnpj, digits))
    .limit(1);

  if (!user) {
    await bcrypt.compare(password, "$2a$10$invalidhashfortimingprotection00000000000000000000000");
    recordCpfFailure(digits);
    await handleFailedLogin(clientIp, digits);
    await recordLoginAttempt({ ip: clientIp, cpfCnpj: digits, success: false });
    res.status(401).json({ error: "CPF/CNPJ ou senha inválidos." });
    return;
  }
  if (!user.isActive) {
    await bcrypt.compare(password, "$2a$10$invalidhashfortimingprotection00000000000000000000000");
    res.status(401).json({ error: "CPF/CNPJ ou senha inválidos." });
    return;
  }
  if (!user.emailVerified) {
    res.status(403).json({ error: "E-mail não verificado. Verifique sua caixa de entrada.", email: user.email });
    return;
  }

  // ── 2. Validar senha ──────────────────────────────────────────────────────
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const cpfNowBlocked = recordCpfFailure(digits);
    const nowBlocked = await handleFailedLogin(clientIp, digits);
    await recordLoginAttempt({ ip: clientIp, cpfCnpj: digits, userId: user.id, success: false, blocked: nowBlocked });
    if (cpfNowBlocked) {
      res.status(423).json({
        error: "CPF/CNPJ bloqueado temporariamente por excesso de tentativas. Aguarde 15 minutos.",
        code: "cpf_blocked",
      });
    } else if (nowBlocked) {
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
  clearCpfAttempts(digits);
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
      logger.error({ err, to: user.email, reason: (err as Error).message }, "verify-ip: falha ao enviar e-mail — verifique SMTP em Admin → Configurações");
    }
    if (user.phone) {
      try {
        await sendWaText(user.phone, `*LealCert — Acesso de novo dispositivo* 🛡️\n\nOlá, ${user.name}!\n\nDetectamos um acesso de um novo endereço IP. Seu código de verificação é: *${code}*\n\nEle expira em 15 minutos. Se não foi você, ignore esta mensagem.`);
      } catch (err) {
        logger.error({ err, phone: user.phone }, "verify-ip: falha ao enviar WhatsApp com código de IP");
      }
    } else {
      logger.warn({ userId: user.id }, "verify-ip: usuário sem telefone cadastrado — WhatsApp não enviado");
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
    .orderBy(desc(ipVerificationsTable.createdAt))
    .limit(1);

  if (
    !verification ||
    verification.code !== String(code).trim() ||
    verification.usedAt ||
    verification.expiresAt < now
  ) {
    logger.warn({ userId: user.id, storedIp: verification?.ip, clientIp, hasCode: !!code, expired: verification ? verification.expiresAt < now : null, alreadyUsed: !!verification?.usedAt }, "verify-ip: falha na validação");
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

// ── POST /auth/resend-ip-verification — Reenviar código de IP ─────────────────
router.post("/auth/resend-ip-verification", async (req, res): Promise<void> => {
  const { cpfCnpj } = req.body ?? {};
  if (!cpfCnpj) {
    res.status(400).json({ error: "CPF/CNPJ é obrigatório." });
    return;
  }
  const digits = cpfCnpj.replace(/\D/g, "");
  const [user] = await db.select().from(usersTable).where(eq(usersTable.cpfCnpj, digits)).limit(1);
  if (!user || !user.email) {
    res.status(400).json({ error: "Usuário não encontrado." });
    return;
  }

  // Rate limit: só permite reenvio a cada 60 segundos
  const [last] = await db
    .select()
    .from(ipVerificationsTable)
    .where(eq(ipVerificationsTable.userId, user.id))
    .orderBy(desc(ipVerificationsTable.createdAt))
    .limit(1);

  const now = new Date();
  if (last && (now.getTime() - new Date(last.createdAt).getTime()) < 60_000) {
    res.status(429).json({ error: "Aguarde 60 segundos antes de reenviar o código." });
    return;
  }

  const code = generateIpVerificationCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await db.insert(ipVerificationsTable).values({ userId: user.id, ip: getClientIp(req as Parameters<typeof getClientIp>[0]), code, expiresAt });
  try {
    await sendIpVerificationEmail(user.email, user.name, code);
  } catch (err) {
    logger.error({ err, to: user.email, reason: (err as Error).message }, "resend-ip-verification: falha ao enviar e-mail — verifique SMTP em Admin → Configurações");
  }
  if (user.phone) {
    try {
      await sendWaText(user.phone, `*LealCert — Código de verificação* 🛡️\n\nSeu novo código é: *${code}*\n\nEle expira em 15 minutos.`);
    } catch (err) {
      logger.error({ err, phone: user.phone }, "resend-ip-verification: falha ao enviar WhatsApp");
    }
  } else {
    logger.warn({ userId: user.id }, "resend-ip-verification: usuário sem telefone cadastrado — WhatsApp não enviado");
  }
  res.json({ message: "Código reenviado." });
});

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { cpfCnpj } = req.body ?? {};
  if (!cpfCnpj) {
    res.status(400).json({ error: "CPF/CNPJ é obrigatório." });
    return;
  }
  const digits = cpfCnpj.replace(/\D/g, "");

  // Delay constante para impedir timing attack (usuário existente vs. não existente)
  const minDelayMs = 400;
  const startedAt = Date.now();
  const ensureDelay = () => {
    const elapsed = Date.now() - startedAt;
    const remaining = minDelayMs - elapsed;
    return remaining > 0 ? new Promise(r => setTimeout(r, remaining)) : Promise.resolve();
  };

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.cpfCnpj, digits))
    .limit(1);

  if (!user || !user.email) {
    await ensureDelay();
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
  if (user.phone) {
    sendWaText(user.phone, `*LealCert — Senha temporária* 🔑\n\nOlá, ${user.name}!\n\nSua senha temporária é: *${tempPassword}*\n\nAcesse o sistema e troque a senha assim que possível.`).catch(() => {});
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

// ── POST /auth/report-block — Abrir chamado de desbloqueio de IP (sem login) ──
// Rate limit simples: máx 1 chamado por IP a cada 10 minutos (em memória)
const reportBlockCooldown = new Map<string, number>();
router.post("/auth/report-block", async (req, res): Promise<void> => {
  const clientIp = getClientIp(req as Parameters<typeof getClientIp>[0]);
  const lastCall = reportBlockCooldown.get(clientIp) ?? 0;
  if (Date.now() - lastCall < 10 * 60 * 1000) {
    res.status(429).json({ error: "Aguarde 10 minutos antes de abrir outro chamado." });
    return;
  }

  const { cpfCnpj, message } = req.body ?? {};
  if (!cpfCnpj) {
    res.status(400).json({ error: "CPF/CNPJ é obrigatório." });
    return;
  }
  const digits = String(cpfCnpj).replace(/\D/g, "");
  const [user] = await db.select().from(usersTable).where(eq(usersTable.cpfCnpj, digits)).limit(1);
  if (!user) {
    res.status(404).json({ error: "CPF/CNPJ não encontrado. Verifique os dados informados." });
    return;
  }

  const subject = "Solicitação de desbloqueio de IP";
  const content = [
    `Usuário: ${user.name}`,
    `CPF/CNPJ: ${digits}`,
    `IP reportado: ${clientIp}`,
    message ? `\nMensagem: ${message}` : "",
    "\n---\nEsta solicitação foi aberta automaticamente pela tela de login após bloqueio de IP.",
  ].filter(Boolean).join("\n");

  const [ticket] = await db.insert(ticketsTable).values({
    userId: user.id,
    subject,
    status: "open",
    unreadAdmin: true,
    unreadClient: false,
  }).returning();

  await db.insert(messagesTable).values({
    ticketId: ticket.id,
    userId: user.id,
    content,
  });

  reportBlockCooldown.set(clientIp, Date.now());
  res.json({ ok: true, ticketId: ticket.id });
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
  const { name, email, phone, currentPassword, newPassword,
          zipCode, street, addressNumber, complement, neighborhood, city, addressState } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name) updates.name = name;

  // Verificar unicidade de e-mail e telefone antes de salvar
  if (email) {
    const emailNorm = String(email).toLowerCase().trim();
    const [emailConflict] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.email, emailNorm), not(eq(usersTable.id, userId))))
      .limit(1);
    if (emailConflict) {
      res.status(409).json({ error: "Este e-mail já está cadastrado em outra conta." });
      return;
    }
    updates.email = emailNorm;
  }
  if (phone) {
    const phoneNorm = String(phone).replace(/\D/g, "");
    const [phoneConflict] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.phone, phoneNorm), not(eq(usersTable.id, userId))))
      .limit(1);
    if (phoneConflict) {
      res.status(409).json({ error: "Este telefone já está cadastrado em outra conta." });
      return;
    }
    updates.phone = phoneNorm;
  }

  if (zipCode !== undefined) updates.zipCode = zipCode ? String(zipCode).replace(/\D/g, "") : null;
  if (street !== undefined) updates.street = street || null;
  if (addressNumber !== undefined) updates.addressNumber = addressNumber || null;
  if (complement !== undefined) updates.complement = complement || null;
  if (neighborhood !== undefined) updates.neighborhood = neighborhood || null;
  if (city !== undefined) updates.city = city || null;
  if (addressState !== undefined) updates.addressState = addressState || null;

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
