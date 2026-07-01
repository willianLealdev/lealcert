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
  try {
    const [s] = await db.select().from(settingsTable).limit(1);
    const evo = evolutionSettingsFrom(s);
    if (!evo) return;
    await sendWhatsApp(evo, phone, message);
  } catch (err) {
    logger.error({ err, phone }, "sendWaText: erro ao enviar WhatsApp");
  }
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
  created: "Criado",
  pending_payment: "Aguardando Pagamento",
  paid: "Pagamento Confirmado ✅",
  protocol_assigned: "Protocolo Atribuído 📋",
  completed: "Concluído 🎉",
  cancelled: "Cancelado ❌",
};

function buildStatusWhatsApp(opts: {
  customerName: string;
  orderNumber: string;
  status: string;
  certName?: string;
  protocolNumber?: string;
}): string {
  const statusLabel = STATUS_LABELS[opts.status] ?? opts.status;
  let msg = `*LealCert — Atualização de Pedido*\n\nOlá, ${opts.customerName}!\n\nSeu pedido foi atualizado:\n🔢 Pedido: *#${opts.orderNumber}*\n📌 Status: *${statusLabel}*`;
  if (opts.certName) msg += `\n📄 Certificado: ${opts.certName}`;
  if (opts.protocolNumber) msg += `\n🔑 Protocolo: ${opts.protocolNumber}`;

  if (opts.status === "paid") {
    msg += "\n\n✅ Pagamento confirmado! Em breve você receberá as instruções para agendar a emissão do seu certificado.";
  } else if (opts.status === "protocol_assigned") {
    msg += "\n\n📋 Seu pedido foi registrado no sistema do provedor. Aguarde as instruções de agendamento.";
  } else if (opts.status === "completed") {
    msg += "\n\n🎉 Seu certificado digital foi emitido com sucesso! Já pode utilizá-lo.";
  } else if (opts.status === "cancelled") {
    msg += "\n\nSe tiver dúvidas, entre em contato com nossa equipe.";
  }

  return msg;
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

  // Notificar o responsável pela conta (usuário que criou o pedido) nos eventos críticos
  const notifyResponsible = ["completed", "aguardando_validacao", "pending_docs"].includes(opts.status);
  if (notifyResponsible && opts.responsiblePhone && evo) {
    const certLabel = opts.certName ? ` — ${opts.certName}` : "";
    let responsibleMsg = "";
    if (opts.status === "completed") {
      responsibleMsg = `*LealCert — Certificado emitido* ✅\n\nO certificado de *${opts.customerName}*${certLabel} (Pedido #${opts.orderNumber}) foi *emitido com sucesso*!\n\nAcesse o painel para mais detalhes.`;
    } else {
      responsibleMsg = `*LealCert — Pendência no pedido* ⚠️\n\nO pedido de *${opts.customerName}*${certLabel} (#${opts.orderNumber}) requer atenção.\n\nAcesse o painel para verificar a pendência e regularizar a situação.`;
    }
    sendWhatsApp(evo, opts.responsiblePhone, responsibleMsg).catch((err: unknown) =>
      logger.error({ err }, "notifyOrderStatus: erro ao enviar WhatsApp ao responsável"),
    );
  }
}

export async function notifyScheduling(opts: {
  to?: string | null;
  phone?: string | null;
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
      `*LealCert — Agendamento Confirmado* 📅\n\nOlá, ${opts.customerName}!\n\nSeu atendimento foi agendado!\n\n🔢 Pedido: #${opts.orderNumber}\n🔑 Protocolo: ${opts.protocolo}\n📍 Local: ${opts.localNome}\n⏰ Data/Hora: ${opts.dataHora}\n\nLembre-se de levar um documento de identificação com foto.`;
    sendWhatsApp(evo, opts.phone, msg).catch((err: unknown) =>
      logger.error({ err }, "Erro ao enviar WhatsApp de agendamento"),
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
    const msg =
      `*LealCert — Pedido Registrado* 📋\n\nOlá, ${opts.customerName}!\n\nSeu pedido *#${opts.orderNumber}* foi registrado no sistema ${providerLabel}${opts.protocolNumber ? ` com protocolo *${opts.protocolNumber}*` : ""}.\n\nAgora você já pode agendar o atendimento! Acesse o painel ou aguarde nosso contato. 😊`;
    sendWhatsApp(evo, opts.phone, msg).catch((err: unknown) =>
      logger.error({ err }, "Erro ao enviar WhatsApp provider registrado"),
    );
  }
}
