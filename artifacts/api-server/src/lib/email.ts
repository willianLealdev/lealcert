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

const LOGO_B64 = "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";

function emailHeader(): string {
  return `
    <div style="text-align:center;margin-bottom:24px;padding:20px 0 0;">
      <img src="data:image/png;base64,${LOGO_B64}" alt="LealCert" style="height:64px;width:auto;max-width:240px;" />
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

  await transporter.sendMail({ from: FROM, to: opts.to, subject, html, text });
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
  await transporter.sendMail({ from: FROM, to: opts.to, subject, html, text });
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
  await transporter.sendMail({ from: FROM, to: opts.to, subject, html, text });
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
  await transporter.sendMail({ from: FROM, to, subject, html, text });
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
  await transporter.sendMail({ from: FROM, to, subject, html, text });
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

  await transporter.sendMail({ from: FROM, to, subject, html, text });
  logger.info({ to }, "Verification email sent");
}
