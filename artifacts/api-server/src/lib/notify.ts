/**
 * notify.ts — Notificações unificadas: e-mail + WhatsApp (Evolution API).
 * Use sempre esta lib para notificar clientes sobre status de pedidos.
 */
import { db, settingsTable } from "@workspace/db";
import { sendOrderStatusEmail, sendSchedulingEmail } from "./email";
import { sendWhatsApp } from "./evolution";
import { logger } from "./logger";

/**
 * Envia uma mensagem WhatsApp avulsa para qualquer número.
 * Busca as configurações do banco internamente.
 * Fire-and-forget — não lança exceção se Evolution não estiver configurada.
 */
export async function sendWaText(phone: string | null | undefined, message: string): Promise<void> {
  if (!phone) return;
  const [s] = await db.select().from(settingsTable).limit(1);
  const evo = evolutionSettingsFrom(s);
  if (!evo) {
    logger.warn({ phone }, "sendWaText: Evolution API não configurada — WhatsApp não enviado");
    return;
  }
  await sendWhatsApp(evo, phone, message);
}

async function getSettings() {
  const [s] = await db.select().from(settingsTable).limit(1);
  return s ?? null;
}

function evolutionSettingsFrom(s: Awaited<ReturnType<typeof getSettings>>) {
  if (!s?.evolutionUrl || !s?.evolutionApiKey || !s?.evolutionInstance) return null;
  return { evolutionUrl: s.evolutionUrl, evolutionApiKey: s.evolutionApiKey, evolutionInstance: s.evolutionInstance };
}

const STATUS_LABELS: Record<string, string> = {
  created: "Pedido Criado",
  pending_payment: "Aguardando Pagamento",
  paid: "Pagamento Efetuado",
  protocol_assigned: "Pedido Validado",
  completed: "Certificado Emitido",
  cancelled: "Cancelado",
};

function buildStatusWhatsApp(opts: {
  customerName: string;
  orderNumber: string;
  status: string;
  certName?: string;
  protocolNumber?: string;
}): string {
  const cert = opts.certName ? `\n📄 Certificado: ${opts.certName}` : "";
  const proto = opts.protocolNumber ? `\n🔑 Protocolo: *${opts.protocolNumber}*` : "";

  if (opts.status === "created") {
    return (
      `*LealCert — Pedido Criado* 🎉\n\n` +
      `Olá, *${opts.customerName}*!\n\n` +
      `Seu pedido foi criado com sucesso!\n` +
      `🔢 Pedido: *#${opts.orderNumber}*${cert}\n\n` +
      `⚠️ Para prosseguir, efetue o pagamento pelo painel. Somente após a confirmação do pagamento será possível agendar o atendimento.\n\n` +
      `Qualquer dúvida, estamos à disposição. 😊`
    );
  }

  if (opts.status === "paid") {
    return (
      `*LealCert — Pagamento Efetuado* ✅\n\n` +
      `Olá, *${opts.customerName}*!\n\n` +
      `Recebemos o pagamento do seu pedido!\n` +
      `🔢 Pedido: *#${opts.orderNumber}*${cert}\n\n` +
      `Acesse o painel e efetue o agendamento do seu atendimento. 📅\n\n` +
      `🌐 lealcert.com.br`
    );
  }

  if (opts.status === "protocol_assigned") {
    return (
      `*LealCert — Pedido Validado* 📋\n\n` +
      `Olá, *${opts.customerName}*!\n\n` +
      `Seu pedido foi validado com sucesso!\n` +
      `🔢 Pedido: *#${opts.orderNumber}*${cert}${proto}\n\n` +
      `Agora você já pode agendar seu atendimento. Acesse o painel e escolha o melhor horário para você. 😊`
    );
  }

  if (opts.status === "completed") {
    return (
      `*LealCert — Certificado Emitido* 🎉\n\n` +
      `Olá, *${opts.customerName}*!\n\n` +
      `Seu certificado digital foi emitido com sucesso!\n` +
      `🔢 Pedido: *#${opts.orderNumber}*${cert}${proto}\n\n` +
      `Você já pode utilizá-lo normalmente. 🔐\n\n` +
      `_Obrigado por escolher a LealCert! Foi um prazer atendê-lo. Qualquer necessidade futura, estamos aqui. 💙_`
    );
  }

  if (opts.status === "cancelled") {
    return (
      `*LealCert — Pedido Cancelado* ❌\n\n` +
      `Olá, *${opts.customerName}*!\n\n` +
      `Seu pedido *#${opts.orderNumber}* foi cancelado.\n\n` +
      `Se tiver dúvidas ou precisar de ajuda, entre em contato com nossa equipe.`
    );
  }

  // Fallback genérico
  const statusLabel = STATUS_LABELS[opts.status] ?? opts.status;
  return (
    `*LealCert — Atualização de Pedido*\n\n` +
    `Olá, *${opts.customerName}*!\n\n` +
    `Seu pedido *#${opts.orderNumber}* foi atualizado para: *${statusLabel}*${cert}${proto}`
  );
}

export async function notifyOrderStatus(opts: {
  to?: string | null;
  phone?: string | null;
  responsiblePhone?: string | null;
  customerName: string;
  orderNumber: string;
  status: string;
  total?: number;
  certName?: string;
  protocolNumber?: string;
}): Promise<void> {
  const s = await getSettings();
  const evo = evolutionSettingsFrom(s);

  if (opts.to) {
    sendOrderStatusEmail({
      to: opts.to,
      customerName: opts.customerName,
      orderNumber: opts.orderNumber,
      status: opts.status,
      total: opts.total,
      certName: opts.certName,
      protocolNumber: opts.protocolNumber,
    }).catch((err: unknown) => logger.error({ err }, "Erro ao enviar e-mail de status"));
  }

  if (opts.phone && evo) {
    const msg = buildStatusWhatsApp(opts);
    sendWhatsApp(evo, opts.phone, msg).catch((err: unknown) =>
      logger.error({ err }, "notifyOrderStatus: erro ao enviar WhatsApp ao cliente"),
    );
  }

  // Notificar o responsável (usuário que criou o pedido) em todos os eventos, EXCETO pedido criado e pagamento confirmado
  const notifyResponsible = !["created", "paid"].includes(opts.status);
  if (notifyResponsible && opts.responsiblePhone && evo) {
    const certLabel = opts.certName ? ` — ${opts.certName}` : "";
    const proto = opts.protocolNumber ? ` | Protocolo: ${opts.protocolNumber}` : "";
    let responsibleMsg = "";
    if (opts.status === "completed") {
      responsibleMsg = `*LealCert — Certificado emitido* ✅\n\nO certificado de *${opts.customerName}*${certLabel} (Pedido #${opts.orderNumber}${proto}) foi *emitido com sucesso*!\n\nAcesse o painel para mais detalhes.`;
    } else if (opts.status === "cancelled") {
      responsibleMsg = `*LealCert — Pedido cancelado* ❌\n\nO pedido de *${opts.customerName}*${certLabel} (#${opts.orderNumber}) foi *cancelado*.\n\nAcesse o painel para mais detalhes.`;
    } else if (opts.status === "protocol_assigned") {
      responsibleMsg = `*LealCert — Pedido validado* 📋\n\nO pedido de *${opts.customerName}*${certLabel} (#${opts.orderNumber}${proto}) foi *validado* e está pronto para agendamento.\n\nAcesse o painel para acompanhar.`;
    } else {
      const statusLabel = STATUS_LABELS[opts.status] ?? opts.status;
      responsibleMsg = `*LealCert — Atualização de pedido* 📌\n\nPedido de *${opts.customerName}*${certLabel} (#${opts.orderNumber}) atualizado para: *${statusLabel}*.\n\nAcesse o painel para mais detalhes.`;
    }
    sendWhatsApp(evo, opts.responsiblePhone, responsibleMsg).catch((err: unknown) =>
      logger.error({ err }, "notifyOrderStatus: erro ao enviar WhatsApp ao responsável"),
    );
  }
}

export async function notifyScheduling(opts: {
  to?: string | null;
  phone?: string | null;
  responsiblePhone?: string | null;
  customerName: string;
  orderNumber: string;
  protocolo: string;
  localNome: string;
  dataHora: string;
}): Promise<void> {
  const s = await getSettings();
  const evo = evolutionSettingsFrom(s);

  if (opts.to) {
    sendSchedulingEmail({
      to: opts.to,
      customerName: opts.customerName,
      orderNumber: opts.orderNumber,
      protocolo: opts.protocolo,
      localNome: opts.localNome,
      dataHora: opts.dataHora,
    }).catch((err: unknown) => logger.error({ err }, "Erro ao enviar e-mail de agendamento"));
  }

  if (opts.phone && evo) {
    const msg =
      `*LealCert — Agendamento Realizado* 📅\n\n` +
      `Olá, *${opts.customerName}*!\n\n` +
      `Seu atendimento foi agendado com sucesso!\n\n` +
      `🔢 Pedido: *#${opts.orderNumber}*\n` +
      `🔑 Protocolo: *${opts.protocolo}*\n` +
      `📍 Local: ${opts.localNome}\n` +
      `⏰ Data e Hora: *${opts.dataHora}*\n\n` +
      `⚠️ Importante: apresente um documento de identificação original (RG ou CNH) no momento do atendimento. Compareça com 10 minutos de antecedência.\n\n` +
      `Qualquer dúvida, estamos à disposição. 😊`;
    sendWhatsApp(evo, opts.phone, msg).catch((err: unknown) =>
      logger.error({ err }, "Erro ao enviar WhatsApp de agendamento"),
    );
  }

  if (opts.responsiblePhone && evo) {
    const responsibleMsg =
      `*LealCert — Agendamento confirmado* 📅\n\n` +
      `O atendimento de *${opts.customerName}* (Pedido #${opts.orderNumber}) foi agendado.\n\n` +
      `📍 Local: ${opts.localNome}\n` +
      `⏰ Data e Hora: *${opts.dataHora}*\n\n` +
      `Acesse o painel para mais detalhes.`;
    sendWhatsApp(evo, opts.responsiblePhone, responsibleMsg).catch((err: unknown) =>
      logger.error({ err }, "Erro ao enviar WhatsApp de agendamento ao responsável"),
    );
  }
}

export async function notifyProviderRegistered(opts: {
  to?: string | null;
  phone?: string | null;
  customerName: string;
  orderNumber: string;
  certName?: string;
  provider: "gestaoar" | "safeweb";
  protocolNumber?: string;
}): Promise<void> {
  const s = await getSettings();
  const evo = evolutionSettingsFrom(s);

  const providerLabel = opts.provider === "safeweb" ? "Safeweb" : "Gestão AR";

  if (opts.to) {
    sendOrderStatusEmail({
      to: opts.to,
      customerName: opts.customerName,
      orderNumber: opts.orderNumber,
      status: "protocol_assigned",
      certName: opts.certName,
      protocolNumber: opts.protocolNumber,
    }).catch((err: unknown) => logger.error({ err }, "Erro ao enviar e-mail provider registrado"));
  }

  if (opts.phone && evo) {
    const msg = buildStatusWhatsApp({
      customerName: opts.customerName,
      orderNumber: opts.orderNumber,
      status: "protocol_assigned",
      certName: opts.certName,
      protocolNumber: opts.protocolNumber,
    });
    sendWhatsApp(evo, opts.phone, msg).catch((err: unknown) =>
      logger.error({ err }, "Erro ao enviar WhatsApp provider registrado"),
    );
  }
}
