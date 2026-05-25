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

const FROM = process.env.SMTP_FROM ?? "LealCert <naoresponda@lealcert.com.br>";

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

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;padding:32px 24px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:26px;font-weight:900;color:#0f172a;letter-spacing:-1px;">LEAL<span style="color:#2563eb;">CERT</span></span>
        <p style="color:#64748b;font-size:13px;margin:4px 0 0;">Certificados Digitais ICP-Brasil</p>
      </div>
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
      <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:20px;">
        Para acompanhar seu pedido, acesse <a href="https://lealcert.com.br/entrar" style="color:#2563eb;">lealcert.com.br</a><br>
        Dúvidas? Responda este e-mail ou fale conosco pelo WhatsApp.
      </p>
    </div>
  `;

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
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;padding:32px 24px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:26px;font-weight:900;color:#0f172a;letter-spacing:-1px;">LEAL<span style="color:#2563eb;">CERT</span></span>
        <p style="color:#64748b;font-size:13px;margin:4px 0 0;">Certificados Digitais ICP-Brasil</p>
      </div>
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
          Para reagendar ou verificar seu pedido, acesse seu painel em 
          <a href="${opts.siteUrl || "https://lealcert.com.br"}/entrar" style="color:#2563eb;">${opts.siteUrl || "lealcert.com.br"}</a>.
        </p>
      </div>
      <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:20px;">
        Dúvidas? Fale conosco pelo WhatsApp ou responda este e-mail.
      </p>
    </div>
  `;
  const text = `Agendamento confirmado!\n\nOlá, ${opts.customerName}!\n\nPedido: #${opts.orderNumber}\nProtocolo: ${opts.protocolo}\nLocal: ${opts.localNome}\nData e hora: ${opts.dataHora}\n\nApresente documento de identificação original.\n\nLealCert — Certificados Digitais`;

  const transporter = createTransporter();
  if (!transporter) {
    logger.info({ to: opts.to, orderNumber: opts.orderNumber }, "📧 [DEV] Scheduling confirmation email (SMTP not configured)");
    return;
  }
  await transporter.sendMail({ from: FROM, to: opts.to, subject, html, text });
  logger.info({ to: opts.to, orderNumber: opts.orderNumber }, "Scheduling confirmation email sent");
}

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
