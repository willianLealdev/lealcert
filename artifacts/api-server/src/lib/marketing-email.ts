import { logger } from "./logger";
import { db, settingsTable } from "@workspace/db";
import type { MarketingCampaign, MarketingContact } from "@workspace/db";

async function getSmtpConfig() {
  const rows = await db.select({
    appName:    settingsTable.appName,
    siteUrl:    settingsTable.siteUrl,
    mailFrom:   settingsTable.mailFrom,
    smtpHostDb: settingsTable.smtpHostDb,
    smtpPortDb: settingsTable.smtpPortDb,
    smtpUserDb: settingsTable.smtpUserDb,
    smtpPassDb: settingsTable.smtpPassDb,
  }).from(settingsTable).limit(1);

  const s = rows[0];
  return {
    appName: s?.appName ?? "LealCert",
    siteUrl: s?.siteUrl ?? "https://lealcert.com.br",
    mailFrom: s?.mailFrom ?? null,
    host: s?.smtpHostDb ?? null,
    port: parseInt(s?.smtpPortDb ?? "587", 10),
    user: s?.smtpUserDb ?? null,
    pass: s?.smtpPassDb ?? null,
  };
}

async function createTransporter() {
  const cfg = await getSmtpConfig();
  if (!cfg.host || !cfg.user || !cfg.pass) return null;
  const nodemailer = (await import("nodemailer")).default;
  return {
    transport: nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
      tls: { rejectUnauthorized: false },
    }),
    cfg,
  };
}

interface SendMarketingEmailOptions {
  campaign: MarketingCampaign;
  contact: MarketingContact;
  trackingToken: string;
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

export async function sendMarketingEmail({ campaign, contact, trackingToken }: SendMarketingEmailOptions): Promise<void> {
  const result = await createTransporter();
  if (!result) {
    logger.info({ to: contact.email, subject: campaign.subject, trackingToken }, "📧 [DEV] Marketing email (SMTP não configurado no painel)");
    return;
  }
  const { transport, cfg } = result;
  const baseUrl = cfg.siteUrl;
  const pixelUrl = `${baseUrl}/api/marketing/track/${trackingToken}.png`;
  const unsubUrl = `${baseUrl}/unsubscribe?token=${trackingToken}`;

  const bodyWithVars = campaign.bodyHtml
    .replace(/{{nome}}/gi, contact.name)
    .replace(/{{email}}/gi, contact.email);

  const bodyWithLinks = wrapLinks(bodyWithVars, baseUrl, trackingToken);

  const html = bodyWithLinks + `
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="font-size:11px;color:#94a3b8;">
        Para cancelar o recebimento de e-mails, <a href="${unsubUrl}" style="color:#94a3b8;">clique aqui</a>.
      </p>
    </div>
    <img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />`;

  const text = (campaign.bodyText ?? campaign.bodyHtml.replace(/<[^>]*>/g, " "))
    .replace(/{{nome}}/gi, contact.name)
    .replace(/{{email}}/gi, contact.email);

  const from = `${campaign.fromName} <${campaign.fromEmail}>`;
  const replyTo = campaign.replyTo ?? undefined;

  await transport.sendMail({ from, to: `${contact.name} <${contact.email}>`, subject: campaign.subject, html, text, replyTo });
}

interface SendReplyEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  body: string;
}

export async function sendReplyEmail({ to, toName, subject, body }: SendReplyEmailOptions): Promise<void> {
  const result = await createTransporter();
  if (!result) {
    logger.info({ to, subject }, "📧 [DEV] Reply email (SMTP não configurado no painel)");
    return;
  }
  const { transport, cfg } = result;
  const from = cfg.mailFrom ?? `${cfg.appName} <naoresponda@${cfg.siteUrl.replace(/^https?:\/\//, "")}>`;
  const html = `<div style="font-family:sans-serif;line-height:1.6;">${body.replace(/\n/g, "<br>")}</div>`;
  const recipient = toName ? `${toName} <${to}>` : to;
  await transport.sendMail({ from, to: recipient, subject, html, text: body });
}

export async function sendSystemEmail(opts: { to: string; toName?: string; subject: string; html: string; text?: string }): Promise<void> {
  const result = await createTransporter();
  if (!result) {
    logger.info({ to: opts.to, subject: opts.subject }, "📧 [DEV] System email (SMTP não configurado no painel)");
    return;
  }
  const { transport, cfg } = result;
  const from = cfg.mailFrom ?? `${cfg.appName} <naoresponda@${cfg.siteUrl.replace(/^https?:\/\//, "")}>`;
  const recipient = opts.toName ? `${opts.toName} <${opts.to}>` : opts.to;
  await transport.sendMail({ from, to: recipient, subject: opts.subject, html: opts.html, text: opts.text ?? opts.html.replace(/<[^>]*>/g, " ") });
}
