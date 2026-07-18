import { logger } from "./logger";
import { db, settingsTable } from "@workspace/db";
import type { MarketingCampaign, MarketingContact } from "@workspace/db";

async function getMarketingConfig() {
  const rows = await db.select({
    appName:       settingsTable.appName,
    siteUrl:       settingsTable.siteUrl,
    mailFrom:      settingsTable.mailFrom,
    smtpHostDb:    settingsTable.smtpHostDb,
    smtpPortDb:    settingsTable.smtpPortDb,
    smtpUserDb:    settingsTable.smtpUserDb,
    smtpPassDb:    settingsTable.smtpPassDb,
    mktSmtpHostDb: settingsTable.mktSmtpHostDb,
    mktSmtpPortDb: settingsTable.mktSmtpPortDb,
    mktSmtpUserDb: settingsTable.mktSmtpUserDb,
    mktSmtpPassDb: settingsTable.mktSmtpPassDb,
    mktMailFrom:   settingsTable.mktMailFrom,
    resendApiKey:  settingsTable.resendApiKey,
    mktUseResend:  settingsTable.mktUseResend,
  }).from(settingsTable).limit(1);

  const s = rows[0];

  const useResend = s?.mktUseResend === "1" && !!s?.resendApiKey;
  const useHost = s?.mktSmtpHostDb || s?.smtpHostDb;
  const usePort = s?.mktSmtpPortDb || s?.smtpPortDb;
  const useUser = s?.mktSmtpUserDb || s?.smtpUserDb;
  const usePass = s?.mktSmtpPassDb || s?.smtpPassDb;
  const useFrom = s?.mktMailFrom || s?.mailFrom;

  return {
    appName:     s?.appName ?? "LealCert",
    siteUrl:     s?.siteUrl || "https://lealcert.com.br",
    mailFrom:    useFrom ?? null,
    useResend,
    resendApiKey: useResend ? s?.resendApiKey ?? null : null,
    host: useHost ?? null,
    port: parseInt(usePort ?? "587", 10),
    user: useUser ?? null,
    pass: usePass ?? null,
  };
}

async function createSmtpTransporter(cfg: Awaited<ReturnType<typeof getMarketingConfig>>) {
  if (!cfg.host || !cfg.user || !cfg.pass) return null;
  const nodemailer = (await import("nodemailer")).default;
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false, checkServerIdentity: () => undefined },
  });
}

async function sendViaResend(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
}): Promise<void> {
  const body: Record<string, unknown> = {
    from: opts.from,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  };
  if (opts.replyTo) body.reply_to = opts.replyTo;
  if (opts.headers && Object.keys(opts.headers).length > 0) body.headers = opts.headers;

  logger.info({ headers: opts.headers }, "Resend: headers incluídos no envio");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseData = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Resend API error ${res.status}: ${responseData.message ?? JSON.stringify(responseData)}`);
  }
  logger.info({ resendEmailId: responseData.id }, "Resend: email aceito pela API");
}

function wrapLinks(html: string, baseUrl: string, trackingToken: string): string {
  return html.replace(
    /(<a\s[^>]*href=["'])([^"']+)(["'][^>]*>)/gi,
    (match, pre, url, post) => {
      if (url.startsWith("/api/marketing/") || url.startsWith("mailto:") || url.startsWith("#")) return match;
      const tracked = `${baseUrl}/api/marketing/click/${trackingToken}?url=${encodeURIComponent(url)}`;
      return `${pre}${tracked}${post}`;
    }
  );
}

interface SendMarketingEmailOptions {
  campaign: MarketingCampaign;
  contact: MarketingContact;
  trackingToken: string;
}

export async function sendMarketingEmail({ campaign, contact, trackingToken }: SendMarketingEmailOptions): Promise<void> {
  const cfg = await getMarketingConfig();

  const baseUrl = cfg.siteUrl;
  const pixelUrl = `${baseUrl}/api/marketing/track/${trackingToken}`;
  // Token estável por contato (RFC 8058) — não muda entre campanhas; fallback para tracking token
  const contactToken = contact.unsubToken ?? trackingToken;
  const unsubUrl = `${baseUrl}/unsubscribe?token=${contactToken}`;
  const unsubApiUrl = `${baseUrl}/api/marketing/unsubscribe?token=${contactToken}`;

  const bodyWithVars = campaign.bodyHtml
    .replace(/{{nome}}/gi, contact.name)
    .replace(/{{email}}/gi, contact.email);

  const bodyWithLinks = wrapLinks(bodyWithVars, baseUrl, trackingToken);

  const html = bodyWithLinks + `
    <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center;font-family:sans-serif;">
      <p style="font-size:12px;color:#94a3b8;margin:0 0 12px;">
        Você está recebendo este e-mail pois faz parte da nossa lista de contatos.
      </p>
      <a href="${unsubUrl}"
         style="display:inline-block;padding:8px 20px;background-color:#f1f5f9;color:#64748b;font-size:12px;text-decoration:none;border-radius:6px;border:1px solid #e2e8f0;">
        Cancelar recebimento de e-mails
      </a>
      <p style="font-size:10px;color:#cbd5e1;margin:12px 0 0;">
        ${cfg.appName} · ${baseUrl}
      </p>
    </div>
    <img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />`;

  const text = (campaign.bodyText ?? campaign.bodyHtml.replace(/<[^>]*>/g, " "))
    .replace(/{{nome}}/gi, contact.name)
    .replace(/{{email}}/gi, contact.email)
    + `\n\n---\nPara cancelar o recebimento de e-mails acesse: ${unsubUrl}`;

  const from = `${campaign.fromName} <${campaign.fromEmail}>`;
  const headers: Record<string, string> = {
    "List-Unsubscribe": `<${unsubApiUrl}>, <mailto:${campaign.fromEmail}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };

  if (cfg.useResend && cfg.resendApiKey) {
    await sendViaResend({
      apiKey: cfg.resendApiKey,
      from,
      to: `${contact.name} <${contact.email}>`,
      subject: campaign.subject,
      html,
      text,
      replyTo: campaign.replyTo ?? undefined,
      headers,
    });
    logger.info({ to: contact.email, subject: campaign.subject, provider: "resend" }, "📧 Marketing email enviado via Resend");
    return;
  }

  const transport = await createSmtpTransporter(cfg);
  if (!transport) {
    logger.info({ to: contact.email, subject: campaign.subject, trackingToken }, "📧 [DEV] Marketing email (SMTP não configurado no painel)");
    return;
  }

  const replyTo = campaign.replyTo ?? undefined;
  await transport.sendMail({ from, to: `${contact.name} <${contact.email}>`, subject: campaign.subject, html, text, replyTo, headers });
  logger.info({ to: contact.email, subject: campaign.subject, provider: "smtp" }, "📧 Marketing email enviado via SMTP");
}

interface SendReplyEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  body: string;
}

export async function sendReplyEmail({ to, toName, subject, body }: SendReplyEmailOptions): Promise<void> {
  const cfg = await getMarketingConfig();
  const html = `<div style="font-family:sans-serif;line-height:1.6;">${body.replace(/\n/g, "<br>")}</div>`;
  const recipient = toName ? `${toName} <${to}>` : to;
  const from = cfg.mailFrom ?? `${cfg.appName} <naoresponda@${cfg.siteUrl.replace(/^https?:\/\//, "")}>`;

  if (cfg.useResend && cfg.resendApiKey) {
    await sendViaResend({ apiKey: cfg.resendApiKey, from, to: recipient, subject, html, text: body });
    logger.info({ to, subject, provider: "resend" }, "📧 Reply email enviado via Resend");
    return;
  }

  const transport = await createSmtpTransporter(cfg);
  if (!transport) {
    logger.info({ to, subject }, "📧 [DEV] Reply email (SMTP não configurado no painel)");
    return;
  }
  await transport.sendMail({ from, to: recipient, subject, html, text: body });
}

export async function sendSystemEmail(opts: { to: string; toName?: string; subject: string; html: string; text?: string }): Promise<void> {
  const rows = await db.select({
    appName: settingsTable.appName, siteUrl: settingsTable.siteUrl, mailFrom: settingsTable.mailFrom,
    smtpHostDb: settingsTable.smtpHostDb, smtpPortDb: settingsTable.smtpPortDb,
    smtpUserDb: settingsTable.smtpUserDb, smtpPassDb: settingsTable.smtpPassDb,
  }).from(settingsTable).limit(1);
  const s = rows[0];
  const host = s?.smtpHostDb ?? null;
  const port = parseInt(s?.smtpPortDb ?? "587", 10);
  const user = s?.smtpUserDb ?? null;
  const pass = s?.smtpPassDb ?? null;
  const appName = s?.appName ?? "LealCert";
  const siteUrl = s?.siteUrl || "https://lealcert.com.br";
  const mailFrom = s?.mailFrom ?? null;

  if (!host || !user || !pass) {
    logger.info({ to: opts.to, subject: opts.subject }, "📧 [DEV] System email (SMTP não configurado no painel)");
    return;
  }
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
  const from = mailFrom ?? `${appName} <naoresponda@${siteUrl.replace(/^https?:\/\//, "")}>`;
  const recipient = opts.toName ? `${opts.toName} <${opts.to}>` : opts.to;
  await transport.sendMail({ from, to: recipient, subject: opts.subject, html: opts.html, text: opts.text ?? opts.html.replace(/<[^>]*>/g, " ") });
}
