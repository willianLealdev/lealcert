import path from "path";
import { logger } from "./logger";
import { db, settingsTable } from "@workspace/db";

// Fetch SMTP + branding from DB — tudo configurado pelo painel admin
async function getEmailConfig() {
  const rows = await db.select({
    appName: settingsTable.appName,
    siteUrl: settingsTable.siteUrl,
    mailFrom: settingsTable.mailFrom,
    smtpHostDb: settingsTable.smtpHostDb,
    smtpPortDb: settingsTable.smtpPortDb,
    smtpUserDb: settingsTable.smtpUserDb,
    smtpPassDb: settingsTable.smtpPassDb,
    logoUrl: settingsTable.logoUrl,
  }).from(settingsTable).limit(1);

  const s = rows[0];
  const appName = s?.appName ?? "LealCert";
  const siteUrl = s?.siteUrl ?? "https://lealcert.com.br";
  // SMTP: DB tem prioridade; fallback para env vars se DB não configurado
  const host = s?.smtpHostDb || process.env.SMTP_HOST || null;
  const port = parseInt(s?.smtpPortDb ?? process.env.SMTP_PORT ?? "587", 10);
  const user = s?.smtpUserDb || process.env.SMTP_USER || null;
  const pass = s?.smtpPassDb || process.env.SMTP_PASS || null;
  const from = s?.mailFrom || process.env.SMTP_FROM || `${appName} <naoresponda@lealcert.com.br>`;
  const logoUrl = s?.logoUrl ?? null;

  return { appName, siteUrl, host, port, user, pass, from, logoUrl };
}

async function createTransporter(cfg: Awaited<ReturnType<typeof getEmailConfig>>) {
  if (!cfg.host || !cfg.user || !cfg.pass) {
    logger.warn("SMTP not configured — emails will be logged only");
    return null;
  }
  const nodemailer = (await import("nodemailer")).default;
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false },
  });
}

const LOGO_CID = "logo@app";
const LOGO_PATH = path.join(__dirname, "logo-email.png");

function logoAttachment(logoUrl: string | null) {
  if (logoUrl) return null; // use URL in <img src> directly
  return { filename: "logo.png", path: LOGO_PATH, cid: LOGO_CID };
}

function emailHeader(appName: string, logoUrl: string | null): string {
  const imgSrc = logoUrl ? logoUrl : `cid:${LOGO_CID}`;
  return `
    <div style="text-align:center;margin-bottom:24px;padding:20px 0 0;">
      <img src="${imgSrc}" alt="${appName}" style="height:64px;width:auto;max-width:240px;" />
    </div>
  `;
}

function emailWrapper(content: string, appName: string, logoUrl: string | null): string {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;padding:32px 24px;border-radius:12px;">
      ${emailHeader(appName, logoUrl)}
      ${content}
      <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px;">
        ${appName} — Certificados Digitais ICP-Brasil
      </p>
    </div>
  `;
}

const STATUS_LABELS: Record<string, string> = {
  created: "Pedido Criado",
  pending_payment: "Aguardando Pagamento",
  paid: "Pagamento Efetuado",
  protocol_assigned: "Pedido Validado",
  completed: "Certificado Emitido",
  cancelled: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  created: "#2563eb",
  pending_payment: "#f59e0b",
  paid: "#10b981",
  protocol_assigned: "#2563eb",
  completed: "#10b981",
  cancelled: "#ef4444",
};

function statusBanner(status: string, statusLabel: string, color: string): string {
  const icons: Record<string, string> = {
    created: "🎉",
    pending_payment: "⏳",
    paid: "✅",
    protocol_assigned: "📋",
    completed: "🏆",
    cancelled: "❌",
  };
  const icon = icons[status] ?? "📌";
  return `
    <div style="background:${color}15;border:1px solid ${color}40;border-radius:8px;padding:18px;margin-bottom:20px;text-align:center;">
      <div style="font-size:28px;margin-bottom:6px;">${icon}</div>
      <div style="font-size:18px;font-weight:700;color:${color};">${statusLabel}</div>
    </div>`;
}

function statusMessage(opts: { status: string; customerName: string; certName?: string; protocolNumber?: string; total?: number }): string {
  if (opts.status === "created") {
    return `
      <p style="color:#475569;margin:0 0 16px;">Seu pedido foi criado com sucesso!</p>
      <p style="color:#475569;margin:0 0 16px;">⚠️ Para prosseguir, efetue o pagamento pelo painel. Somente após a confirmação do pagamento será possível agendar o atendimento.</p>
      <p style="color:#475569;margin:0;">Qualquer dúvida, nossa equipe está à disposição. 😊</p>`;
  }
  if (opts.status === "paid") {
    return `
      <p style="color:#475569;margin:0 0 16px;">Recebemos o pagamento do seu pedido! ✅</p>
      <p style="color:#475569;margin:0;">Acesse o painel e efetue o agendamento do seu atendimento. 📅</p>`;
  }
  if (opts.status === "protocol_assigned") {
    return `
      <p style="color:#475569;margin:0 0 16px;">Seu pedido foi validado com sucesso! 📋</p>
      <p style="color:#475569;margin:0;">Agora você já pode agendar seu atendimento. Acesse o painel e escolha o melhor horário para você. 😊</p>`;
  }
  if (opts.status === "completed") {
    return `
      <p style="color:#475569;margin:0 0 16px;">Seu certificado digital foi <strong>emitido com sucesso</strong>! Você já pode utilizá-lo normalmente. 🔐</p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-top:16px;text-align:center;">
        <p style="color:#1e40af;font-size:15px;font-weight:600;margin:0 0 6px;">💙 Obrigado por escolher a ${opts.certName ? "LealCert" : "LealCert"}!</p>
        <p style="color:#3b82f6;font-size:13px;margin:0;">Foi um prazer atendê-lo. Qualquer necessidade futura, estamos aqui.</p>
      </div>`;
  }
  if (opts.status === "cancelled") {
    return `<p style="color:#475569;margin:0;">Seu pedido foi cancelado. Se tiver dúvidas ou precisar de ajuda, entre em contato com nossa equipe.</p>`;
  }
  return `<p style="color:#475569;margin:0;">Seu pedido foi atualizado. Para mais detalhes, acesse o painel.</p>`;
}

export async function sendOrderStatusEmail(opts: {
  to: string;
  customerName: string;
  orderNumber: string;
  status: string;
  total?: number;
  certName?: string;
  protocolNumber?: string;
}): Promise<void> {
  const cfg = await getEmailConfig();
  const statusLabel = STATUS_LABELS[opts.status] ?? opts.status;
  const color = STATUS_COLORS[opts.status] ?? "#64748b";
  const subject = `${statusLabel} — Pedido #${opts.orderNumber} | ${cfg.appName}`;

  const html = emailWrapper(`
    <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e2e8f0;">
      <h2 style="color:#0f172a;margin:0 0 16px;font-size:18px;">Olá, ${opts.customerName}!</h2>
      ${statusBanner(opts.status, statusLabel, color)}
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
        <tr><td style="padding:6px 0;color:#64748b;width:40%;">Pedido</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">#${opts.orderNumber}</td></tr>
        ${opts.certName ? `<tr><td style="padding:6px 0;color:#64748b;">Certificado</td><td style="padding:6px 0;color:#0f172a;">${opts.certName}</td></tr>` : ""}
        ${opts.total !== undefined ? `<tr><td style="padding:6px 0;color:#64748b;">Total</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">R$ ${opts.total.toFixed(2)}</td></tr>` : ""}
        ${opts.protocolNumber ? `<tr><td style="padding:6px 0;color:#64748b;">Protocolo</td><td style="padding:6px 0;font-weight:600;color:#2563eb;">${opts.protocolNumber}</td></tr>` : ""}
      </table>
      ${statusMessage(opts)}
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
      Para acompanhar seu pedido, acesse <a href="${cfg.siteUrl}/entrar" style="color:#2563eb;">${cfg.siteUrl.replace(/^https?:\/\//, "")}</a><br>
      Dúvidas? Responda este e-mail ou fale conosco pelo WhatsApp.
    </p>
  `, cfg.appName, cfg.logoUrl);

  const text = `Olá, ${opts.customerName}!\n\n${statusLabel} — Pedido #${opts.orderNumber}\n${opts.certName ? `Certificado: ${opts.certName}\n` : ""}${opts.total !== undefined ? `Total: R$ ${opts.total.toFixed(2)}\n` : ""}${opts.protocolNumber ? `Protocolo: ${opts.protocolNumber}\n` : ""}\n\nAcesse: ${cfg.siteUrl}/entrar\n\n${cfg.appName} — Certificados Digitais`;

  const transporter = await createTransporter(cfg);
  if (!transporter) {
    logger.info({ to: opts.to, orderNumber: opts.orderNumber, status: opts.status }, "📧 [DEV] Order status email (SMTP not configured)");
    return;
  }

  const attachment = logoAttachment(cfg.logoUrl);
  await transporter.sendMail({
    from: cfg.from, to: opts.to, subject, html, text,
    ...(attachment ? { attachments: [attachment] } : {}),
  });
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
  const cfg = await getEmailConfig();
  const siteUrl = opts.siteUrl ?? cfg.siteUrl;
  const subject = `Agendamento confirmado — Pedido #${opts.orderNumber} | ${cfg.appName}`;
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
        <a href="${siteUrl}/entrar" style="color:#2563eb;">${siteUrl.replace(/^https?:\/\//, "")}</a>.
      </p>
    </div>
  `, cfg.appName, cfg.logoUrl);
  const text = `Agendamento confirmado!\n\nOlá, ${opts.customerName}!\n\nPedido: #${opts.orderNumber}\nProtocolo: ${opts.protocolo}\nLocal: ${opts.localNome}\nData e hora: ${opts.dataHora}\n\nApresente documento de identificação original.\n\n${cfg.appName} — Certificados Digitais`;

  const transporter = await createTransporter(cfg);
  if (!transporter) {
    logger.info({ to: opts.to, orderNumber: opts.orderNumber }, "📧 [DEV] Scheduling email (SMTP not configured)");
    return;
  }
  const attachment = logoAttachment(cfg.logoUrl);
  await transporter.sendMail({
    from: cfg.from, to: opts.to, subject, html, text,
    ...(attachment ? { attachments: [attachment] } : {}),
  });
  logger.info({ to: opts.to, orderNumber: opts.orderNumber }, "Scheduling email sent");
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
  const cfg = await getEmailConfig();
  const siteUrl = opts.siteUrl ?? cfg.siteUrl;
  const daysText = opts.daysLeft === 1 ? "amanhã" : `em ${opts.daysLeft} dias`;
  const urgency = opts.daysLeft <= 7 ? "#ef4444" : opts.daysLeft <= 30 ? "#f59e0b" : "#2563eb";
  const subject = `⚠️ Seu certificado digital vence ${daysText} | ${cfg.appName}`;
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
        <a href="${siteUrl}/entrar" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
          Renovar Certificado
        </a>
      </div>
    </div>
  `, cfg.appName, cfg.logoUrl);
  const text = `Atenção, ${opts.customerName}!\n\nSeu certificado ${opts.certificateName} vence ${daysText} (${expiresFormatted}).\n\nAcesse para renovar: ${siteUrl}/entrar\n\n${cfg.appName} — Certificados Digitais`;

  const transporter = await createTransporter(cfg);
  if (!transporter) {
    logger.info({ to: opts.to, daysLeft: opts.daysLeft }, "📧 [DEV] Renewal alert email (SMTP not configured)");
    return;
  }
  const attachment = logoAttachment(cfg.logoUrl);
  await transporter.sendMail({
    from: cfg.from, to: opts.to, subject, html, text,
    ...(attachment ? { attachments: [attachment] } : {}),
  });
  logger.info({ to: opts.to, daysLeft: opts.daysLeft }, "Renewal alert email sent");
}

export async function sendWelcomeEmail(to: string, name: string, userType: string): Promise<void> {
  const cfg = await getEmailConfig();
  const typeLabel = userType === "contador" ? "Contador" : "Cliente";
  const subject = `Bem-vindo à ${cfg.appName}!`;
  const html = emailWrapper(`
    <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
      <h2 style="color:#0f172a;margin:0 0 8px;font-size:20px;">Olá, ${name}! 👋</h2>
      <p style="color:#475569;margin:0 0 20px;">Sua conta foi ativada com sucesso. Você está cadastrado como <strong>${typeLabel}</strong>.</p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="color:#1e40af;font-size:14px;margin:0;font-weight:600;">✅ Conta verificada e pronta para uso</p>
      </div>
      <p style="color:#475569;font-size:14px;margin:0 0 20px;">Agora você pode acessar a plataforma e adquirir seus certificados digitais com praticidade e segurança.</p>
      <div style="text-align:center;">
        <a href="${cfg.siteUrl}/entrar" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
          Acessar minha conta
        </a>
      </div>
    </div>
  `, cfg.appName, cfg.logoUrl);
  const text = `Olá, ${name}!\n\nSua conta ${cfg.appName} foi ativada com sucesso. Acesse: ${cfg.siteUrl}/entrar\n\n${cfg.appName} — Certificados Digitais`;

  const transporter = await createTransporter(cfg);
  if (!transporter) {
    logger.info({ to, userType }, "📧 [DEV] Welcome email (SMTP not configured)");
    return;
  }
  const attachment = logoAttachment(cfg.logoUrl);
  await transporter.sendMail({
    from: cfg.from, to, subject, html, text,
    ...(attachment ? { attachments: [attachment] } : {}),
  });
  logger.info({ to }, "Welcome email sent");
}

export async function sendTempPasswordEmail(to: string, name: string, tempPassword: string): Promise<void> {
  const cfg = await getEmailConfig();
  const subject = `Sua senha temporária — ${cfg.appName}`;
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
        <a href="${cfg.siteUrl}/entrar" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
          Acessar e redefinir senha
        </a>
      </div>
    </div>
  `, cfg.appName, cfg.logoUrl);
  const text = `Olá, ${name}!\n\nSua senha temporária ${cfg.appName}: ${tempPassword}\n\nAo fazer login, você deverá cadastrar uma nova senha.\n\nAcesse: ${cfg.siteUrl}/entrar`;

  const transporter = await createTransporter(cfg);
  if (!transporter) {
    logger.info({ to, tempPassword }, "📧 [DEV] Temp password email (SMTP not configured)");
    return;
  }
  const attachment = logoAttachment(cfg.logoUrl);
  await transporter.sendMail({
    from: cfg.from, to, subject, html, text,
    ...(attachment ? { attachments: [attachment] } : {}),
  });
  logger.info({ to }, "Temp password email sent");
}

export async function sendIpVerificationEmail(to: string, name: string, code: string): Promise<void> {
  const cfg = await getEmailConfig();
  const subject = `Acesso de novo endereço — confirme sua identidade | ${cfg.appName}`;
  const html = emailWrapper(`
    <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
      <h2 style="color:#0f172a;margin:0 0 8px;font-size:18px;">Olá, ${name}!</h2>
      <p style="color:#475569;margin:0 0 16px;">Detectamos uma tentativa de acesso à sua conta a partir de um endereço de rede diferente do habitual.</p>
      <div style="background:#fef3c7;border:1px solid #f59e0b40;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#92400e;">
        ⚠️ <strong>Se não foi você</strong>, ignore este e-mail e sua conta permanecerá protegida.
      </div>
      <p style="color:#475569;margin:0 0 16px;">Para confirmar que é você e liberar o acesso, use o código abaixo:</p>
      <div style="background:#0f172a;border-radius:10px;padding:24px;text-align:center;margin-bottom:20px;">
        <p style="color:#94a3b8;font-size:12px;margin:0 0 8px;letter-spacing:1px;text-transform:uppercase;">Código de verificação</p>
        <span style="font-size:42px;font-weight:900;letter-spacing:12px;color:#ffffff;">${code}</span>
      </div>
      <p style="color:#94a3b8;font-size:13px;margin:0;text-align:center;">Válido por <strong>15 minutos</strong>. Não compartilhe com ninguém.</p>
    </div>
  `, cfg.appName, cfg.logoUrl);
  const text = `Olá, ${name}!\n\nAcesso detectado de novo endereço de rede.\nCódigo de verificação: ${code}\nVálido por 15 minutos.\n\nSe não foi você, ignore este e-mail.`;

  const transporter = await createTransporter(cfg);
  if (!transporter) {
    logger.info({ to, code }, "📧 [DEV] IP verification email (SMTP not configured)");
    return;
  }
  const attachment = logoAttachment(cfg.logoUrl);
  await transporter.sendMail({
    from: cfg.from, to, subject, html, text,
    ...(attachment ? { attachments: [attachment] } : {}),
  });
  logger.info({ to }, "IP verification email sent");
}

export async function sendDailySalesReport(opts: {
  to: string;
  date: Date;
  cpfCount: number;
  cnpjCount: number;
  otherCount: number;
  totalValue: number;
  orderCount: number;
}): Promise<void> {
  const cfg = await getEmailConfig();
  const dateStr = opts.date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const subject = `📊 Relatório de Vendas — ${opts.date.toLocaleDateString("pt-BR")} | ${cfg.appName}`;

  const totalFormatted = opts.totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const hasOrders = opts.orderCount > 0;

  const html = emailWrapper(`
    <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
      <h2 style="color:#0f172a;margin:0 0 4px;font-size:20px;">📊 Relatório de Vendas</h2>
      <p style="color:#64748b;margin:0 0 24px;font-size:14px;text-transform:capitalize;">${dateStr}</p>

      ${hasOrders ? `
      <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
        <div style="flex:1;min-width:120px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:900;color:#0284c7;">${opts.cpfCount}</div>
          <div style="font-size:12px;color:#0369a1;font-weight:600;margin-top:4px;">e-CPF</div>
        </div>
        <div style="flex:1;min-width:120px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:900;color:#16a34a;">${opts.cnpjCount}</div>
          <div style="font-size:12px;color:#15803d;font-weight:600;margin-top:4px;">e-CNPJ</div>
        </div>
        ${opts.otherCount > 0 ? `
        <div style="flex:1;min-width:120px;background:#fafafa;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:900;color:#64748b;">${opts.otherCount}</div>
          <div style="font-size:12px;color:#64748b;font-weight:600;margin-top:4px;">Outros</div>
        </div>` : ""}
      </div>

      <div style="background:#0f172a;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px;">
        <div style="color:#94a3b8;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Total arrecadado</div>
        <div style="color:#f59e0b;font-size:32px;font-weight:900;">${totalFormatted}</div>
        <div style="color:#64748b;font-size:12px;margin-top:4px;">${opts.orderCount} pedido${opts.orderCount !== 1 ? "s" : ""} confirmado${opts.orderCount !== 1 ? "s" : ""}</div>
      </div>` : `
      <div style="background:#f8fafc;border-radius:10px;padding:32px;text-align:center;border:1px solid #e2e8f0;margin-bottom:20px;">
        <div style="font-size:32px;margin-bottom:8px;">😴</div>
        <div style="color:#64748b;font-size:15px;">Nenhuma venda registrada ontem.</div>
      </div>`}

      <a href="${cfg.siteUrl}/orders" style="display:block;text-align:center;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;padding:12px;font-weight:600;font-size:14px;">
        Ver todos os pedidos →
      </a>
    </div>
  `, cfg.appName, cfg.logoUrl);

  const text = `Relatório ${dateStr}\n\ne-CPF: ${opts.cpfCount}\ne-CNPJ: ${opts.cnpjCount}${opts.otherCount > 0 ? `\nOutros: ${opts.otherCount}` : ""}\nTotal: ${totalFormatted}\n\n${opts.orderCount} pedido(s) confirmado(s).`;

  const transporter = await createTransporter(cfg);
  if (!transporter) {
    logger.info({ to: opts.to, cpf: opts.cpfCount, cnpj: opts.cnpjCount, total: opts.totalValue }, "📧 [DEV] Daily sales report (SMTP not configured)");
    return;
  }
  const attachment = logoAttachment(cfg.logoUrl);
  await transporter.sendMail({
    from: cfg.from, to: opts.to, subject, html, text,
    ...(attachment ? { attachments: [attachment] } : {}),
  });
  logger.info({ to: opts.to }, "Daily sales report sent");
}

export async function sendSupportReplyEmail(opts: {
  to: string;
  customerName: string;
  subject: string;
  messageContent: string;
  ticketId: number;
}): Promise<void> {
  const cfg = await getEmailConfig();
  const emailSubject = `Re: ${opts.subject} | ${cfg.appName} — Suporte`;
  const html = emailWrapper(`
    <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e2e8f0;">
      <h2 style="color:#0f172a;margin:0 0 8px;font-size:18px;">Olá, ${opts.customerName}!</h2>
      <p style="color:#475569;margin:0 0 20px;">Nossa equipe respondeu ao seu chamado de suporte:</p>
      <div style="background:#f8fafc;border-left:4px solid #2563eb;border-radius:4px;padding:16px;margin-bottom:20px;">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Assunto: ${opts.subject}</div>
        <p style="color:#0f172a;font-size:15px;margin:0;white-space:pre-wrap;">${opts.messageContent}</p>
      </div>
      <div style="text-align:center;">
        <a href="${cfg.siteUrl}/support/${opts.ticketId}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
          Ver chamado completo
        </a>
      </div>
    </div>
  `, cfg.appName, cfg.logoUrl);
  const text = `Olá, ${opts.customerName}!\n\nNossa equipe respondeu ao seu chamado "${opts.subject}":\n\n${opts.messageContent}\n\nAcesse: ${cfg.siteUrl}/support/${opts.ticketId}\n\n${cfg.appName} — Suporte`;

  const transporter = await createTransporter(cfg);
  if (!transporter) {
    logger.info({ to: opts.to, ticketId: opts.ticketId }, "📧 [DEV] Support reply email (SMTP not configured)");
    return;
  }
  const attachment = logoAttachment(cfg.logoUrl);
  await transporter.sendMail({
    from: cfg.from, to: opts.to, subject: emailSubject, html, text,
    ...(attachment ? { attachments: [attachment] } : {}),
  });
  logger.info({ to: opts.to, ticketId: opts.ticketId }, "Support reply email sent");
}

export async function sendVerificationEmail(to: string, name: string, code: string): Promise<void> {
  const cfg = await getEmailConfig();
  const subject = `Código de verificação — ${cfg.appName}`;
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
  `, cfg.appName, cfg.logoUrl);
  const text = `Olá, ${name}!\n\nSeu código de verificação ${cfg.appName}: ${code}\n\nVálido por 30 minutos.`;

  const transporter = await createTransporter(cfg);
  if (!transporter) {
    logger.info({ to, code }, "📧 [DEV] Verification email (SMTP not configured)");
    return;
  }
  const attachment = logoAttachment(cfg.logoUrl);
  await transporter.sendMail({
    from: cfg.from, to, subject, html, text,
    ...(attachment ? { attachments: [attachment] } : {}),
  });
  logger.info({ to }, "Verification email sent");
}
