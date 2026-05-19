import nodemailer from "nodemailer";
import { logger } from "./logger";

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    logger.warn("SMTP not configured — emails will be logged only (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)");
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const FROM = process.env.SMTP_FROM ?? "LealCert <noreply@lealcert.com>";

export async function sendVerificationEmail(to: string, name: string, code: string): Promise<void> {
  const subject = "Código de verificação — LealCert";
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f8fafc;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:28px;font-weight:900;color:#0f172a;letter-spacing:-1px;">LEAL<span style="color:#2563eb;">CERT</span></span>
      </div>
      <h2 style="color:#0f172a;margin:0 0 8px;">Olá, ${name}!</h2>
      <p style="color:#475569;margin:0 0 24px;">Para confirmar seu cadastro, use o código abaixo:</p>
      <div style="background:#0f172a;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;">
        <span style="font-size:40px;font-weight:900;letter-spacing:10px;color:#ffffff;">${code}</span>
      </div>
      <p style="color:#94a3b8;font-size:13px;margin:0;">Este código expira em <strong>30 minutos</strong>. Se não foi você, ignore este e-mail.</p>
    </div>
  `;
  const text = `Olá, ${name}!\n\nSeu código de verificação LealCert: ${code}\n\nVálido por 30 minutos.`;

  const transporter = createTransporter();
  if (!transporter) {
    logger.info({ to, code }, "📧 [DEV] Verification email (SMTP not configured)");
    return;
  }

  await transporter.sendMail({ from: FROM, to, subject, html, text });
  logger.info({ to }, "Verification email sent");
}
