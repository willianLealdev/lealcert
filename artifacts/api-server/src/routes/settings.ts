import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import nodemailer from "nodemailer";

const router = Router();

async function getOrCreateSettings() {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [s] = await db.insert(settingsTable).values({ appName: "LealCert" }).returning();
  return s;
}

function serializeSettings(s: typeof settingsTable.$inferSelect) {
  return {
    id: s.id,
    appName: s.appName,
    mpAccessToken: s.mpAccessToken,
    mpPublicKey: s.mpPublicKey,
    webhookSecret: s.webhookSecret,
    mailFrom: s.mailFrom,
    siteUrl: s.siteUrl,
    scheduleOpenDays: s.scheduleOpenDays ?? "1,2,3,4,5",
    scheduleOpenHour: s.scheduleOpenHour ?? "9",
    scheduleCloseHour: s.scheduleCloseHour ?? "18",
    scheduleStepMin: s.scheduleStepMin ?? "60",
    scheduleClosedDates: s.scheduleClosedDates ?? "",
    garApiKey: s.garApiKey,
    garHashVendedor: s.garHashVendedor,
    garHashTabela: s.garHashTabela,
    garFormaPagamento: s.garFormaPagamento ?? "11",
    garPreferirVideoconferencia: s.garPreferirVideoconferencia ?? "1",
    safewebUrl: s.safewebUrl,
    safewebUrlHomologacao: s.safewebUrlHomologacao,
    safewebAmbiente: s.safewebAmbiente ?? "producao",
    safewebUsername: s.safewebUsername,
    safewebPassword: s.safewebPassword,
    safewebCnpjAr: s.safewebCnpjAr,
    safewebCodigoParceiro: s.safewebCodigoParceiro,
    activeProvider: s.activeProvider ?? "gestaoar",
    evolutionUrl: s.evolutionUrl,
    evolutionApiKey: s.evolutionApiKey,
    evolutionInstance: s.evolutionInstance,
    logoUrl: s.logoUrl,
    primaryColor: s.primaryColor ?? "#2563eb",
    contactPhone: s.contactPhone,
    contactWhatsapp: s.contactWhatsapp,
    contactEmailSupport: s.contactEmailSupport,
    contactAddress: s.contactAddress,
    smtpHostDb: s.smtpHostDb,
    smtpPortDb: s.smtpPortDb ?? "587",
    smtpUserDb: s.smtpUserDb,
    smtpPassDb: s.smtpPassDb,
    vapidSubject: s.vapidSubject,
    vapidPublicKey: s.vapidPublicKey,
    vapidPrivateKey: s.vapidPrivateKey,
    updatedAt: s.updatedAt,
  };
}

// ── GET /settings (admin) ──────────────────────────────────────────────────
router.get("/settings", requireAdmin, async (_req, res): Promise<void> => {
  const s = await getOrCreateSettings();
  res.json(serializeSettings(s));
});

// ── PATCH /settings (admin) ────────────────────────────────────────────────
router.patch("/settings", requireAdmin, async (req, res): Promise<void> => {
  const s = await getOrCreateSettings();
  const {
    appName, mpAccessToken, mpPublicKey, webhookSecret, mailFrom, siteUrl,
    scheduleOpenDays, scheduleOpenHour, scheduleCloseHour, scheduleStepMin, scheduleClosedDates,
    garApiKey, garHashVendedor, garHashTabela, garFormaPagamento, garPreferirVideoconferencia,
    safewebUrl, safewebUrlHomologacao, safewebAmbiente, safewebUsername, safewebPassword,
    safewebCnpjAr, safewebCodigoParceiro, activeProvider,
    evolutionUrl, evolutionApiKey, evolutionInstance,
    logoUrl, primaryColor,
    contactPhone, contactWhatsapp, contactEmailSupport, contactAddress,
    smtpHostDb, smtpPortDb, smtpUserDb, smtpPassDb,
    vapidSubject, vapidPublicKey, vapidPrivateKey,
  } = req.body ?? {};

  const u: Record<string, unknown> = {};
  if (appName !== undefined) u.appName = appName;
  if (mpAccessToken !== undefined) u.mpAccessToken = mpAccessToken;
  if (mpPublicKey !== undefined) u.mpPublicKey = mpPublicKey;
  if (webhookSecret !== undefined) u.webhookSecret = webhookSecret;
  if (mailFrom !== undefined) u.mailFrom = mailFrom;
  if (siteUrl !== undefined) u.siteUrl = siteUrl;
  if (scheduleOpenDays !== undefined) u.scheduleOpenDays = scheduleOpenDays;
  if (scheduleOpenHour !== undefined) u.scheduleOpenHour = scheduleOpenHour;
  if (scheduleCloseHour !== undefined) u.scheduleCloseHour = scheduleCloseHour;
  if (scheduleStepMin !== undefined) u.scheduleStepMin = scheduleStepMin;
  if (scheduleClosedDates !== undefined) u.scheduleClosedDates = scheduleClosedDates;
  if (garApiKey !== undefined) u.garApiKey = garApiKey;
  if (garHashVendedor !== undefined) u.garHashVendedor = garHashVendedor;
  if (garHashTabela !== undefined) u.garHashTabela = garHashTabela;
  if (garFormaPagamento !== undefined) u.garFormaPagamento = garFormaPagamento;
  if (garPreferirVideoconferencia !== undefined) u.garPreferirVideoconferencia = garPreferirVideoconferencia;
  if (safewebUrl !== undefined) u.safewebUrl = safewebUrl;
  if (safewebUrlHomologacao !== undefined) u.safewebUrlHomologacao = safewebUrlHomologacao;
  if (safewebAmbiente !== undefined) u.safewebAmbiente = safewebAmbiente;
  if (safewebUsername !== undefined) u.safewebUsername = safewebUsername;
  if (safewebPassword !== undefined) u.safewebPassword = safewebPassword;
  if (safewebCnpjAr !== undefined) u.safewebCnpjAr = safewebCnpjAr;
  if (safewebCodigoParceiro !== undefined) u.safewebCodigoParceiro = safewebCodigoParceiro;
  if (activeProvider !== undefined) u.activeProvider = activeProvider;
  if (evolutionUrl !== undefined) u.evolutionUrl = evolutionUrl;
  if (evolutionApiKey !== undefined) u.evolutionApiKey = evolutionApiKey;
  if (evolutionInstance !== undefined) u.evolutionInstance = evolutionInstance;
  if (logoUrl !== undefined) u.logoUrl = logoUrl;
  if (primaryColor !== undefined) u.primaryColor = primaryColor;
  if (contactPhone !== undefined) u.contactPhone = contactPhone;
  if (contactWhatsapp !== undefined) u.contactWhatsapp = contactWhatsapp;
  if (contactEmailSupport !== undefined) u.contactEmailSupport = contactEmailSupport;
  if (contactAddress !== undefined) u.contactAddress = contactAddress;
  if (smtpHostDb !== undefined) u.smtpHostDb = smtpHostDb;
  if (smtpPortDb !== undefined) u.smtpPortDb = smtpPortDb;
  if (smtpUserDb !== undefined) u.smtpUserDb = smtpUserDb;
  if (smtpPassDb !== undefined) u.smtpPassDb = smtpPassDb;
  if (vapidSubject !== undefined) u.vapidSubject = vapidSubject;
  if (vapidPublicKey !== undefined) u.vapidPublicKey = vapidPublicKey;
  if (vapidPrivateKey !== undefined) u.vapidPrivateKey = vapidPrivateKey;

  const [updated] = await db
    .update(settingsTable)
    .set(u as Parameters<typeof db.update>[0] extends infer T ? Record<string, unknown> : never)
    .where(eq(settingsTable.id, s.id))
    .returning();

  res.json(serializeSettings(updated));
});

// ── POST /settings/test-email ──────────────────────────────────────────────
router.post("/settings/test-email", requireAdmin, async (req, res): Promise<void> => {
  const s = await getOrCreateSettings();
  const host = s.smtpHostDb || process.env.SMTP_HOST;
  const port = parseInt(s.smtpPortDb ?? process.env.SMTP_PORT ?? "587", 10);
  const user = s.smtpUserDb || process.env.SMTP_USER;
  const pass = s.smtpPassDb || process.env.SMTP_PASS;
  const from = s.mailFrom || process.env.SMTP_FROM || `${s.appName} <naoresponda@lealcert.com.br>`;
  const to = (req.body as { to?: string })?.to ?? (req.session as { user?: { email?: string } })?.user?.email;

  if (!host || !user || !pass) {
    res.status(400).json({ ok: false, error: "SMTP não configurado. Preencha Host, Usuário e Senha." });
    return;
  }
  if (!to) {
    res.status(400).json({ ok: false, error: "Informe um endereço de e-mail para o teste." });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });
    await transporter.verify();
    await transporter.sendMail({
      from,
      to,
      subject: `✅ Teste de e-mail — ${s.appName}`,
      text: `Este é um e-mail de teste enviado pelo painel de configurações do ${s.appName}. Se você recebeu, o SMTP está funcionando corretamente.`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;"><h2 style="color:#0f172a;">✅ SMTP funcionando!</h2><p style="color:#475569;">Este e-mail confirma que as configurações de envio do <strong>${s.appName}</strong> estão corretas.</p><p style="color:#94a3b8;font-size:12px;">Enviado pelo painel de configurações.</p></div>`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
