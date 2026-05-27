import path from "path";
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
    tls: { rejectUnauthorized: false },
  });
}

const FROM = process.env.SMTP_FROM ?? "LealCert <naoresponda@lealcert.com.br>";
const SITE_URL = "https://lealcert.com.br";
const LOGO_CID = "logo@lealcert";
const LOGO_PATH = path.join(__dirname, "logo-email.png");

function logoAttachment() {
  return {
    filename: "logo.png",
    path: LOGO_PATH,
    cid: LOGO_CID,
  };
}

function emailHeader(): string {
  return `
    <div style="text-align:center;margin-bottom:24px;padding:20px 0 0;">
      <img src="cid:${LOGO_CID}" alt="LealCert" style="height:64px;width:auto;max-width:240px;" />
    </div>
  `;
}

function emailWrapper(content: string): string {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;padding:32px 24px;border-radius:12px;">
      ${emailHeader()}
      ${content}
      <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px;">
        LealCert — Certificados Digitais ICP-Brasil
      </p>
    </div>
  `;
}

const STATUS_LABELS: Record<string, string> = {
  created: "Criado",
  pending_payment: "Aguardando Pagamento",
  paid: "Pagamento Confirmado",
  protocol_assigned: "Protocolo Atribuído",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export async function sendOrderStatusEmail(opts: {
  to: string;
  customerName: string;
  orderNumber: string;
  status: string;
  total?: number;
  certName?: string;
  protocolNumber?: string;
}): Promise<void> {
  const statusLabel = STATUS_LABELS[opts.status] ?? opts.status;
  const subject = `Pedido #${opts.orderNumber} — ${statusLabel} | LealCert`;

  const statusColor: Record<string, string> = {
    pending_payment: "#f59e0b",
    paid: "#10b981",
    protocol_assigned: "#2563eb",
    completed: "#10b981",
    cancelled: "#ef4444",
  };
  const color = statusColor[opts.status] ?? "#64748b";

  const html = emailWrapper(`
    <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e2e8f0;">
      <h2 style="color:#0f172a;margin:0 0 8px;font-size:18px;">Olá, ${opts.customerName}!</h2>
      <p style="color:#475569;margin:0 0 20px;">Seu pedido foi atualizado:</p>
      <div style="background:${color}15;border:1px solid ${color}40;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center;">
        <div style="font-size:13px;color:#64748b;margin-bottom:4px;">Status atual</div>
        <div style="font-size:18px;font-weight:700;color:${color};">${statusLabel}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#64748b;">Pedido</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">#${opts.orderNumber}</td></tr>
        ${opts.certName ? `<tr><td style="padding:6px 0;color:#64748b;">Certificado</td><td style="padding:6px 0;color:#0f172a;">${opts.certName}</td></tr>` : ""}
        ${opts.total !== undefined ? `<tr><td style="padding:6px 0;color:#64748b;">Total</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">R$ ${opts.total.toFixed(2)}</td></tr>` : ""}
        ${opts.protocolNumber ? `<tr><td style="padding:6px 0;color:#64748b;">Protocolo</td><td style="padding:6px 0;font-weight:600;color:#2563eb;">${opts.protocolNumber}</td></tr>` : ""}
      </table>
      ${opts.status === "pending_payment" ? `<div style="margin-top:20px;padding:14px;background:#fef3c7;border-radius:8px;font-size:13px;color:#92400e;">⏳ <strong>Aguardando pagamento.</strong> Após confirmar, nossa equipe entrará em contato para agendar a emissão.</div>` : ""}
      ${opts.status === "paid" ? `<div style="margin-top:20px;padding:14px;background:#dcfce7;border-radius:8px;font-size:13px;color:#166534;">✅ <strong>Pagamento recebido!</strong> Em breve entraremos em contato para agendar a emissão.</div>` : ""}
      ${opts.status === "completed" ? `<div style="margin-top:20px;padding:14px;background:#dcfce7;border-radius:8px;font-size:13px;color:#166534;">🎉 <strong>Certificado emitido com sucesso!</strong> Você já pode utilizá-lo.</div>` : ""}
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
      Para acompanhar seu pedido, acesse <a href="${SITE_URL}/entrar" style="color:#2563eb;">lealcert.com.br</a><br>
      Dúvidas? Responda este e-mail ou fale conosco pelo WhatsApp.
    </p>
  `);

  const text = `Olá, ${opts.customerName}!\n\nSeu pedido #${opts.orderNumber} foi atualizado para: ${statusLabel}\n${opts.certName ? `Certificado: ${opts.certName}\n` : ""}${opts.total !== undefined ? `Total: R$ ${opts.total.toFixed(2)}\n` : ""}${opts.protocolNumber ? `Protocolo: ${opts.protocolNumber}\n` : ""}\nLealCert — Certificados Digitais`;

  const transporter = createTransporter();
  if (!transporter) {
    logger.info({ to: opts.to, orderNumber: opts.orderNumber, status: opts.status }, "📧 [DEV] Order status email (SMTP not configured)");
    return;
  }

  await transporter.sendMail({ from: FROM, to: opts.to, subject, html, text, attachments: [logoAttachment()] });
  logger.info({ to: opts.to, orderNumber: opts.orderNumber, status: opts.status }, "Order status email sent");
}

export async function sendSchedulingEmail(opts: {
  to: string;
  customerName: string;
  orderNumber: string;
  protocolo: string;
  localNome: string;
  dataHora: string;
  siteUrl?: string;
}): Promise<void> {
  const subject = `Agendamento confirmado — Pedido #${opts.orderNumber} | LealCert`;
  const html = emailWrapper(`
    <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e2e8f0;">
      <h2 style="color:#0f172a;margin:0 0 8px;font-size:18px;">🗓 Agendamento confirmado!</h2>
      <p style="color:#475569;margin:0 0 20px;">Olá, <strong>${opts.customerName}</strong>! Seu atendimento foi agendado com sucesso:</p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#64748b;width:40%;">Pedido</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">#${opts.orderNumber}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Protocolo</td><td style="padding:6px 0;font-weight:700;color:#2563eb;">${opts.protocolo}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Local</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">${opts.localNome}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Data e hora</td><td style="padding:6px 0;font-weight:700;color:#0f172a;">${opts.dataHora}</td></tr>
        </table>
      </div>
      <div style="padding:14px;background:#fef3c7;border-radius:8px;font-size:13px;color:#92400e;margin-bottom:16px;">
        ⚠️ <strong>Importante:</strong> apresente seu documento de identificação original (RG ou CNH) no momento do atendimento. Compareça com 10 minutos de antecedência.
      </div>
      <p style="font-size:13px;color:#475569;margin:0;">
        Para reagendar ou verificar seu pedido, acesse
        <a href="${opts.siteUrl || SITE_URL}/entrar" style="color:#2563eb;">lealcert.com.br</a>.
      </p>
    </div>
  `);
  const text = `Agendamento confirmado!\n\nOlá, ${opts.customerName}!\n\nPedido: #${opts.orderNumber}\nProtocolo: ${opts.protocolo}\nLocal: ${opts.localNome}\nData e hora: ${opts.dataHora}\n\nApresente documento de identificação original.\n\nLealCert — Certificados Digitais`;

  const transporter = createTransporter();
  if (!transporter) {
    logger.info({ to: opts.to, orderNumber: opts.orderNumber }, "📧 [DEV] Scheduling confirmation email (SMTP not configured)");
    return;
  }
  await transporter.sendMail({ from: FROM, to: opts.to, subject, html, text, attachments: [logoAttachment()] });
  logger.info({ to: opts.to, orderNumber: opts.orderNumber }, "Scheduling confirmation email sent");
}

export async function sendRenewalAlertEmail(opts: {
  to: string;
  customerName: string;
  certificateName: string;
  protocolo?: string;
  expiresAt: Date;
  daysLeft: number;
  siteUrl?: string;
}): Promise<void> {
  const daysText = opts.daysLeft === 1 ? "amanhã" : `em ${opts.daysLeft} dias`;
  const urgency = opts.daysLeft <= 7 ? "#ef4444" : opts.daysLeft <= 30 ? "#f59e0b" : "#2563eb";
  const subject = `⚠️ Seu certificado digital vence ${daysText} | LealCert`;
  const expiresFormatted = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(opts.expiresAt);
  const html = emailWrapper(`
    <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e2e8f0;">
      <h2 style="color:#0f172a;margin:0 0 8px;font-size:18px;">Olá, ${opts.customerName}!</h2>
      <p style="color:#475569;margin:0 0 20px;">Seu certificado digital está próximo do vencimento.</p>
      <div style="background:${urgency}15;border:2px solid ${urgency}40;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center;">
        <div style="font-size:13px;color:#64748b;margin-bottom:4px;">Vence ${daysText}</div>
        <div style="font-size:22px;font-weight:900;color:${urgency};">${expiresFormatted}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
        <tr><td style="padding:6px 0;color:#64748b;">Certificado</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">${opts.certificateName}</td></tr>
        ${opts.protocolo ? `<tr><td style="padding:6px 0;color:#64748b;">Protocolo</td><td style="padding:6px 0;color:#0f172a;">${opts.protocolo}</td></tr>` : ""}
      </table>
      <div style="text-align:center;">
        <a href="${opts.siteUrl || SITE_URL}/entrar" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
          Renovar Certificado
        </a>
      </div>
      <p style="font-size:13px;color:#94a3b8;margin-top:20px;text-align:center;">
        Não perca o prazo — a renovação garante continuidade nas suas operações digitais.
      </p>
    </div>
  `);
  const text = `Atenção, ${opts.customerName}!\n\nSeu certificado ${opts.certificateName} vence ${daysText} (${expiresFormatted}).\n\nAcesse lealcert.com.br para renovar.\n\nLealCert — Certificados Digitais`;

  const transporter = createTransporter();
  if (!transporter) {
    logger.info({ to: opts.to, certificateName: opts.certificateName, daysLeft: opts.daysLeft }, "📧 [DEV] Renewal alert email (SMTP not configured)");
    return;
  }
  await transporter.sendMail({ from: FROM, to: opts.to, subject, html, text, attachments: [logoAttachment()] });
  logger.info({ to: opts.to, daysLeft: opts.daysLeft }, "Renewal alert email sent");
}

export async function sendWelcomeEmail(to: string, name: string, userType: string): Promise<void> {
  const typeLabel = userType === "contador" ? "Contador" : "Cliente";
  const subject = "Bem-vindo à LealCert!";
  const html = emailWrapper(`
    <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
      <h2 style="color:#0f172a;margin:0 0 8px;font-size:20px;">Olá, ${name}! 👋</h2>
      <p style="color:#475569;margin:0 0 20px;">Sua conta foi ativada com sucesso. Você está cadastrado como <strong>${typeLabel}</strong>.</p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="color:#1e40af;font-size:14px;margin:0;font-weight:600;">✅ Conta verificada e pronta para uso</p>
      </div>
      <p style="color:#475569;font-size:14px;margin:0 0 20px;">Agora você pode acessar a plataforma e adquirir seus certificados digitais com praticidade e segurança.</p>
      <div style="text-align:center;">
        <a href="${SITE_URL}/entrar" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
          Acessar minha conta
        </a>
      </div>
    </div>
  `);
  const text = `Olá, ${name}!\n\nSua conta LealCert foi ativada com sucesso. Acesse: lealcert.com.br/entrar\n\nLealCert — Certificados Digitais`;

  const transporter = createTransporter();
  if (!transporter) {
    logger.info({ to, userType }, "📧 [DEV] Welcome email (SMTP not configured)");
    return;
  }
  await transporter.sendMail({ from: FROM, to, subject, html, text, attachments: [logoAttachment()] });
  logger.info({ to }, "Welcome email sent");
}

export async function sendTempPasswordEmail(to: string, name: string, tempPassword: string): Promise<void> {
  const subject = "Sua senha temporária — LealCert";
  const html = emailWrapper(`
    <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
      <h2 style="color:#0f172a;margin:0 0 8px;">Olá, ${name}!</h2>
      <p style="color:#475569;margin:0 0 20px;">Recebemos uma solicitação de recuperação de senha para sua conta. Use a senha temporária abaixo para acessar:</p>
      <div style="background:#0f172a;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px;">
        <p style="color:#94a3b8;font-size:12px;margin:0 0 8px;letter-spacing:1px;text-transform:uppercase;">Senha temporária</p>
        <span style="font-size:28px;font-weight:900;letter-spacing:4px;color:#ffffff;">${tempPassword}</span>
      </div>
      <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px;margin-bottom:20px;">
        <p style="color:#92400e;font-size:13px;margin:0;">⚠️ Ao fazer login com essa senha, você será solicitado a cadastrar uma nova senha permanente.</p>
      </div>
      <div style="text-align:center;">
        <a href="${SITE_URL}/entrar" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
          Acessar e redefinir senha
        </a>
      </div>
      <p style="font-size:13px;color:#94a3b8;margin-top:20px;text-align:center;">Se não foi você, ignore este e-mail. Sua senha não foi alterada.</p>
    </div>
  `);
  const text = `Olá, ${name}!\n\nSua senha temporária LealCert: ${tempPassword}\n\nAo fazer login, você deverá cadastrar uma nova senha.\n\nAcesse: lealcert.com.br/entrar`;

  const transporter = createTransporter();
  if (!transporter) {
    logger.info({ to, tempPassword }, "📧 [DEV] Temp password email (SMTP not configured)");
    return;
  }
  await transporter.sendMail({ from: FROM, to, subject, html, text, attachments: [logoAttachment()] });
  logger.info({ to }, "Temp password email sent");
}

export async function sendVerificationEmail(to: string, name: string, code: string): Promise<void> {
  const subject = "Código de verificação — LealCert";
  const html = emailWrapper(`
    <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
      <h2 style="color:#0f172a;margin:0 0 8px;font-size:18px;">Olá, ${name}!</h2>
      <p style="color:#475569;margin:0 0 24px;">Para confirmar seu cadastro, use o código abaixo:</p>
      <div style="background:#0f172a;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;">
        <p style="color:#94a3b8;font-size:12px;margin:0 0 8px;letter-spacing:1px;text-transform:uppercase;">Código de verificação</p>
        <span style="font-size:42px;font-weight:900;letter-spacing:12px;color:#ffffff;">${code}</span>
      </div>
      <p style="color:#94a3b8;font-size:13px;margin:0;text-align:center;">Este código expira em <strong>30 minutos</strong>. Se não foi você, ignore este e-mail.</p>
    </div>
  `);
  const text = `Olá, ${name}!\n\nSeu código de verificação LealCert: ${code}\n\nVálido por 30 minutos.`;

  const transporter = createTransporter();
  if (!transporter) {
    logger.info({ to, code }, "📧 [DEV] Verification email (SMTP not configured)");
    return;
  }

  await transporter.sendMail({ from: FROM, to, subject, html, text, attachments: [logoAttachment()] });
  logger.info({ to }, "Verification email sent");
}
