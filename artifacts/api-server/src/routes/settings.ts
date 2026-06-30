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

/** Mask a secret field: return "***" if set, "" if empty. Never returns actual value. */
const mask = (v: string | null | undefined) => (v ? "***" : "");

function serializeSettings(s: typeof settingsTable.$inferSelect) {
  return {
    id: s.id,
    appName: s.appName,
    // Secrets — masked: show "***" if configured, "" if not
    mpAccessToken: mask(s.mpAccessToken),
    mpPublicKey: s.mpPublicKey,                           // public key — safe to expose
    webhookSecret: mask(s.webhookSecret),
    garApiKey: mask(s.garApiKey),
    garHashVendedor: mask(s.garHashVendedor),
    garHashParceiro: mask(s.garHashParceiro),
    garHashTabela: mask(s.garHashTabela),
    safewebPassword: mask(s.safewebPassword),
    safewebPasswordHomologacao: mask(s.safewebPasswordHomologacao),
    evolutionApiKey: mask(s.evolutionApiKey),
    smtpPassDb: mask(s.smtpPassDb),
    vapidPrivateKey: mask(s.vapidPrivateKey),             // crypto private key — never expose
    aiProvider: s.aiProvider ?? "openai",
    openaiApiKey: mask(s.openaiApiKey),
    openaiModel: s.openaiModel ?? "gpt-4o-mini",
    deepseekApiKey: mask(s.deepseekApiKey),
    deepseekModel: s.deepseekModel ?? "deepseek-chat",
    claudeApiKey: mask(s.claudeApiKey),
    claudeModel: s.claudeModel ?? "claude-3-5-haiku-20241022",
    // Non-secret fields
    mailFrom: s.mailFrom,
    siteUrl: s.siteUrl,
    scheduleOpenDays: s.scheduleOpenDays ?? "1,2,3,4,5",
    scheduleOpenHour: s.scheduleOpenHour ?? "9",
    scheduleCloseHour: s.scheduleCloseHour ?? "18",
    scheduleStepMin: s.scheduleStepMin ?? "60",
    scheduleClosedDates: s.scheduleClosedDates ?? "",
    garDocumento: s.garDocumento,
    garFormaPagamento: s.garFormaPagamento ?? "8",
    garPreferirVideoconferencia: s.garPreferirVideoconferencia ?? "1",
    safewebUrl: s.safewebUrl,
    safewebUrlHomologacao: s.safewebUrlHomologacao,
    safewebAmbiente: s.safewebAmbiente ?? "producao",
    safewebUsername: s.safewebUsername,
    safewebUsernameHomologacao: s.safewebUsernameHomologacao,
    safewebCnpjAr: s.safewebCnpjAr,
    safewebCodigoParceiro: s.safewebCodigoParceiro,
    activeProvider: s.activeProvider ?? "gestaoar",
    evolutionUrl: s.evolutionUrl,
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
    vapidSubject: s.vapidSubject,
    vapidPublicKey: s.vapidPublicKey,
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
    garApiKey, garDocumento, garHashVendedor, garHashParceiro, garHashTabela, garFormaPagamento, garPreferirVideoconferencia,
    safewebUrl, safewebUrlHomologacao, safewebAmbiente, safewebUsername, safewebPassword,
    safewebUsernameHomologacao, safewebPasswordHomologacao,
    safewebCnpjAr, safewebCodigoParceiro, activeProvider,
    evolutionUrl, evolutionApiKey, evolutionInstance,
    logoUrl, primaryColor,
    contactPhone, contactWhatsapp, contactEmailSupport, contactAddress,
    smtpHostDb, smtpPortDb, smtpUserDb, smtpPassDb,
    vapidSubject, vapidPublicKey, vapidPrivateKey,
    openaiApiKey, openaiModel,
    deepseekApiKey, deepseekModel,
    claudeApiKey, claudeModel,
    aiProvider,
  } = req.body ?? {};

  // Helper: skip masked sentinel value (never overwrite a real secret with "***")
  const set = (key: string, val: unknown) => {
    if (val !== undefined && val !== "***") u[key] = val;
  };

  const u: Record<string, unknown> = {};
  if (appName !== undefined) u.appName = appName;
  if (mpPublicKey !== undefined) u.mpPublicKey = mpPublicKey;
  if (mailFrom !== undefined) u.mailFrom = mailFrom;
  if (siteUrl !== undefined) u.siteUrl = siteUrl;
  if (scheduleOpenDays !== undefined) u.scheduleOpenDays = scheduleOpenDays;
  if (scheduleOpenHour !== undefined) u.scheduleOpenHour = scheduleOpenHour;
  if (scheduleCloseHour !== undefined) u.scheduleCloseHour = scheduleCloseHour;
  if (scheduleStepMin !== undefined) u.scheduleStepMin = scheduleStepMin;
  if (scheduleClosedDates !== undefined) u.scheduleClosedDates = scheduleClosedDates;
  if (garDocumento !== undefined) u.garDocumento = garDocumento;
  if (garFormaPagamento !== undefined) u.garFormaPagamento = garFormaPagamento;
  if (garPreferirVideoconferencia !== undefined) u.garPreferirVideoconferencia = garPreferirVideoconferencia;
  if (safewebUrl !== undefined) u.safewebUrl = safewebUrl;
  if (safewebUrlHomologacao !== undefined) u.safewebUrlHomologacao = safewebUrlHomologacao;
  if (safewebAmbiente !== undefined) u.safewebAmbiente = safewebAmbiente;
  if (safewebUsername !== undefined) u.safewebUsername = safewebUsername;
  if (safewebUsernameHomologacao !== undefined) u.safewebUsernameHomologacao = safewebUsernameHomologacao;
  if (safewebCnpjAr !== undefined) u.safewebCnpjAr = safewebCnpjAr;
  if (safewebCodigoParceiro !== undefined) u.safewebCodigoParceiro = safewebCodigoParceiro;
  if (activeProvider !== undefined) u.activeProvider = activeProvider;
  if (evolutionUrl !== undefined) u.evolutionUrl = evolutionUrl;
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
  if (vapidSubject !== undefined) u.vapidSubject = vapidSubject;
  if (vapidPublicKey !== undefined) u.vapidPublicKey = vapidPublicKey;
  if (aiProvider !== undefined) u.aiProvider = aiProvider;
  if (openaiModel !== undefined) u.openaiModel = openaiModel;
  if (deepseekModel !== undefined) u.deepseekModel = deepseekModel;
  if (claudeModel !== undefined) u.claudeModel = claudeModel;
  // Sensitive secrets — only update if non-empty and not the masked sentinel "***"
  set("mpAccessToken", mpAccessToken);
  set("webhookSecret", webhookSecret);
  set("garApiKey", garApiKey);
  set("garHashVendedor", garHashVendedor);
  set("garHashParceiro", garHashParceiro);
  set("garHashTabela", garHashTabela);
  set("safewebPassword", safewebPassword);
  set("safewebPasswordHomologacao", safewebPasswordHomologacao);
  set("evolutionApiKey", evolutionApiKey);
  set("smtpPassDb", smtpPassDb);
  set("vapidPrivateKey", vapidPrivateKey);
  set("openaiApiKey", openaiApiKey);
  set("deepseekApiKey", deepseekApiKey);
  set("claudeApiKey", claudeApiKey);

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
  const host = s.smtpHostDb || null;
  const port = parseInt(s.smtpPortDb ?? "587", 10);
  const user = s.smtpUserDb || null;
  const pass = s.smtpPassDb || null;
  const from = s.mailFrom || `${s.appName} <naoresponda@lealcert.com.br>`;
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
