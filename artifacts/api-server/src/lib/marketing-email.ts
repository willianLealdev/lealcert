import nodemailer from "nodemailer";
import { logger } from "./logger";
import type { MarketingCampaign, MarketingContact } from "@workspace/db";

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, tls: { rejectUnauthorized: false } });
}

function getBaseUrl() {
  const domains = process.env.REPLIT_DOMAINS ?? "";
  const domain = domains.split(",")[0]?.trim();
  return domain ? `https://${domain}` : "http://localhost:80";
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
  const baseUrl = getBaseUrl();
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

  const transporter = createTransporter();
  if (!transporter) {
    logger.info({ to: contact.email, subject: campaign.subject, trackingToken }, "📧 [DEV] Marketing email (SMTP not configured)");
    return;
  }

  await transporter.sendMail({ from, to: `${contact.name} <${contact.email}>`, subject: campaign.subject, html, text, replyTo });
}

interface SendReplyEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  body: string;
}

export async function sendReplyEmail({ to, toName, subject, body }: SendReplyEmailOptions): Promise<void> {
  const from = process.env.SMTP_FROM_MARKETING ?? "LealCert Marketing <mkt@lealcert.com.br>";
  const html = `<div style="font-family:sans-serif;line-height:1.6;">${body.replace(/\n/g, "<br>")}</div>`;

  const transporter = createTransporter();
  if (!transporter) {
    logger.info({ to, subject }, "📧 [DEV] Reply email (SMTP not configured)");
    return;
  }

  const recipient = toName ? `${toName} <${to}>` : to;
  await transporter.sendMail({ from, to: recipient, subject, html, text: body });
}

export async function sendSystemEmail(opts: { to: string; toName?: string; subject: string; html: string; text?: string }): Promise<void> {
  const from = process.env.SMTP_FROM_SYSTEM ?? "LealCert <naoresponda@lealcert.com.br>";
  const transporter = createTransporter();
  if (!transporter) {
    logger.info({ to: opts.to, subject: opts.subject }, "📧 [DEV] System email (SMTP not configured)");
    return;
  }
  const recipient = opts.toName ? `${opts.toName} <${opts.to}>` : opts.to;
  await transporter.sendMail({ from, to: recipient, subject: opts.subject, html: opts.html, text: opts.text ?? opts.html.replace(/<[^>]*>/g, " ") });
}
