import { eq, lte, and, isNotNull, notInArray, gte, lt } from "drizzle-orm";
import { db, marketingCampaignsTable, ordersTable, settingsTable, certificatesTable, usersTable, certificateRenewalsTable, type InsertOrder } from "@workspace/db";
import { logger } from "./logger";
import { dispatchCampaign } from "../routes/marketing";
import { sendDailySalesReport } from "./email";
import { notifyOrderStatus } from "./notify";
import { startImapPoller } from "./imap-poller";

let running = false;

async function checkScheduledCampaigns() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const due = await db
      .select()
      .from(marketingCampaignsTable)
      .where(and(
        eq(marketingCampaignsTable.status, "scheduled"),
        lte(marketingCampaignsTable.scheduledAt, now),
      ));

    for (const campaign of due) {
      logger.info({ campaignId: campaign.id, name: campaign.name }, "Dispatching scheduled campaign");
      await db.update(marketingCampaignsTable).set({
        status: "sending",
        scheduledTargetOverride: null,
        scheduledContactIds: null,
        scheduledManualRecipients: null,
      }).where(eq(marketingCampaignsTable.id, campaign.id));

      const opts: import("../routes/marketing").DispatchOptions = {};
      if (campaign.scheduledTargetOverride) {
        opts.targetOverride = campaign.scheduledTargetOverride as import("../routes/marketing").DispatchOptions["targetOverride"];
      }
      if (campaign.scheduledContactIds) {
        try { opts.specificContactIds = JSON.parse(campaign.scheduledContactIds); } catch { /* ignorar */ }
      }
      if (campaign.scheduledManualRecipients) {
        try { opts.manualRecipients = JSON.parse(campaign.scheduledManualRecipients); } catch { /* ignorar */ }
      }

      dispatchCampaign(campaign.id, opts).catch(err => logger.error({ err, campaignId: campaign.id }, "Scheduled campaign dispatch error"));
    }
  } catch (err) {
    logger.error({ err }, "Scheduler check error");
  } finally {
    running = false;
  }
}

// ── Safeweb Status Sync ───────────────────────────────────────────────────────
// Roda a cada 5 minutos, consultando todos os pedidos Safeweb que ainda não
// estão em status final (emitido, revogado, cancelled, completed).
// Isso garante que qualquer mudança no sistema da Safeweb aparece aqui.
let swSyncRunning = false;

async function syncSafewebStatuses() {
  if (swSyncRunning) return;
  swSyncRunning = true;
  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    const activeProvider = settings?.activeProvider ?? "gestaoar";
    if (activeProvider !== "safeweb") return;

    const isHomol = settings?.safewebAmbiente === "homologacao";
    const username = isHomol ? (settings?.safewebUsernameHomologacao ?? settings?.safewebUsername) : settings?.safewebUsername;
    const password = isHomol ? (settings?.safewebPasswordHomologacao ?? settings?.safewebPassword) : settings?.safewebPassword;
    const rawUrl = (isHomol ? settings?.safewebUrlHomologacao : settings?.safewebUrl) ?? settings?.safewebUrl;

    if (!username || !password || !rawUrl) return;

    const swUrl = (() => { try { return new URL(rawUrl).origin; } catch { return rawUrl.replace(/\/Service\/.+$/, "").replace(/\/$/, ""); } })();
    const sw = { url: swUrl, username, password, cnpjAr: settings?.safewebCnpjAr ?? undefined };

    // Busca pedidos Safeweb com status não-finais
    const pendingOrders = await db
      .select({ order: ordersTable, certName: certificatesTable.name })
      .from(ordersTable)
      .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
      .where(and(
        isNotNull(ordersTable.safewebSolicitacaoId),
        notInArray(ordersTable.status, ["emitido", "revogado", "cancelled", "completed"]),
      ));

    if (pendingOrders.length === 0) return;

    logger.info({ count: pendingOrders.length }, "Safeweb sync: verificando pedidos pendentes");

    const { swGetToken } = await import("./safeweb");
    const { logEvent } = await import("../lib/order-events");

    const STATUS_MAP: Record<string, string> = {
      "Emitida": "emitido",
      "Emitido": "emitido",
      "Aguardando": "aguardando_validacao",
      "Pendente": "aguardando_validacao",
      "Validada": "aguardando_validacao",
      "Aprovada": "aguardando_validacao",
      "Cancelada": "cancelled",
      "Cancelado": "cancelled",
      "Revogada": "revogado",
      "Revogado": "revogado",
    };

    for (const { order } of pendingOrders) {
      if (!order.safewebSolicitacaoId) continue;
      try {
        // A Safeweb não tem endpoint GET de status por solicitação — status chega via webhook.
        // O sync periódico apenas tenta GetInformation do agendamento (se disponível).
        if (!order.safewebAgendamentoId) continue;

        const agendId = parseInt(order.safewebAgendamentoId, 10);
        if (isNaN(agendId)) continue;

        const { swAgendaInformacoes } = await import("./safeweb");
        let info: Record<string, unknown>;
        try {
          info = await swAgendaInformacoes(sw, String(agendId)) as Record<string, unknown>;
        } catch {
          continue; // endpoint falhou — aguarda próximo ciclo
        }

        const statusLabel = String(info?.Status ?? info?.Situacao ?? info?.status ?? "");
        if (!statusLabel) continue;

        const newStatus = STATUS_MAP[statusLabel];
        const updates: Record<string, unknown> = {
          safewebStatus: statusLabel,
          safewebSyncedAt: new Date(),
        };
        if (newStatus && order.status !== newStatus) {
          updates.status = newStatus;
          await logEvent(order.id, "gar_status_updated", `Status Safeweb atualizado (sync): ${statusLabel}`, { safewebStatus: statusLabel });
          logger.info({ orderId: order.id, statusLabel, newStatus }, "Safeweb sync: status atualizado");
        }

        await db.update(ordersTable).set(updates as Partial<InsertOrder>).where(eq(ordersTable.id, order.id));
      } catch (err) {
        logger.error({ err, orderId: order.id }, "Safeweb sync: erro ao consultar status");
      }
    }
  } catch (err) {
    logger.error({ err }, "Safeweb sync: erro geral");
  } finally {
    swSyncRunning = false;
  }
}

// ── GAR Protocol Sync ─────────────────────────────────────────────────────────
// Roda a cada 5 minutos.
// Fase 1: pedidos SEM protocolo — tenta emitir ou puxa protocolo do portal GAR.
// Fase 2: pedidos COM protocolo mas não concluídos — consulta status GAR e
//         atualiza o pedido (inclusive detecta "Emitido" → completed).
let garProtocolSyncRunning = false;

async function syncGarProtocols() {
  if (garProtocolSyncRunning) return;
  garProtocolSyncRunning = true;
  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    if (!settings?.garApiKey) return;
    if ((settings.activeProvider ?? "gestaoar") !== "gestaoar") return;

    // Todos os pedidos GAR ativos (não-finais)
    const activeGarOrders = await db
      .select()
      .from(ordersTable)
      .where(and(
        isNotNull(ordersTable.garPedido),
        notInArray(ordersTable.status, ["cancelled", "completed", "revogado"]),
      ));

    if (activeGarOrders.length === 0) return;

    const { garConsultarStatus } = await import("./gestaoar");
    const { emitirProtocoloEHope } = await import("./gar-auto");
    const { logEvent, isGarStatusEmitido } = await import("../lib/order-events");

    const withoutProtocol = activeGarOrders.filter(o => !o.garProtocolo);
    const withProtocol    = activeGarOrders.filter(o =>  o.garProtocolo);

    // ── Fase 1: pedidos sem protocolo ─────────────────────────────────────────
    if (withoutProtocol.length > 0) {
      logger.info({ count: withoutProtocol.length }, "GAR protocol sync: pedidos sem protocolo");
      for (const order of withoutProtocol) {
        if (!order.garPedido) continue;
        try {
          const statusResult = await garConsultarStatus(settings.garApiKey!, order.garPedido);
          const protocolo = statusResult.Protocolo ?? null;

          if (protocolo) {
            logger.info({ orderId: order.id, protocolo }, "GAR protocol sync: protocolo encontrado no GAR, sincronizando");
            let garHopeUploadUrl: string | null = null;
            try {
              const swSettings = { url: settings.safewebUrl ?? "", username: settings.safewebUsername ?? "", password: settings.safewebPassword ?? "" };
              if (swSettings.url && swSettings.username && swSettings.password) {
                const { swHopeSolicitation } = await import("./safeweb");
                const hopeResult = await swHopeSolicitation(swSettings, protocolo);
                garHopeUploadUrl = hopeResult.url ?? null;
              }
            } catch (hopeErr) {
              logger.warn({ err: hopeErr, orderId: order.id }, "GAR protocol sync: falha ao criar Hope solicitation");
            }
            await db.update(ordersTable).set({
              garProtocolo: protocolo,
              garHopeUploadUrl,
              garStatus: "Protocolo emitido",
              status: "protocol_assigned",
            }).where(eq(ordersTable.id, order.id));
            await logEvent(order.id, "gar_protocol_emitted", `Protocolo sincronizado do GAR: ${protocolo}`, { protocolo, garPedido: order.garPedido });
          } else {
            await emitirProtocoloEHope(order.id, order, settings);
          }
        } catch (err) {
          logger.error({ err, orderId: order.id }, "GAR protocol sync: erro ao sincronizar pedido sem protocolo");
        }
      }
    }

    // ── Fase 2: pedidos COM protocolo — atualiza status GAR ──────────────────
    // BUG FIX: antes o scheduler ignorava estes pedidos completamente, fazendo
    // com que o status parasse em "Agendado" mesmo após o certificado ser emitido.
    if (withProtocol.length > 0) {
      logger.info({ count: withProtocol.length }, "GAR status sync: pedidos com protocolo aguardando atualização");
      for (const order of withProtocol) {
        if (!order.garPedido) continue;
        try {
          const statusResult = await garConsultarStatus(settings.garApiKey!, order.garPedido);
          const newGarStatus = statusResult.StatusPedido ?? null;
          const newProtocolo = statusResult.Protocolo ?? order.garProtocolo;

          if (!newGarStatus) continue;

          const wasEmitido = isGarStatusEmitido(newGarStatus) && order.status !== "completed";

          if (wasEmitido) {
            // Certificado emitido — concluir pedido e registrar renovação
            const [certRow] = await db
              .select({ validityMonths: certificatesTable.validityMonths, name: certificatesTable.name })
              .from(certificatesTable)
              .where(eq(certificatesTable.id, order.certificateId!))
              .limit(1);
            const validityMonths = certRow?.validityMonths ?? 12;
            const emittedAt = new Date();
            const expiresAt = new Date(emittedAt);
            expiresAt.setMonth(expiresAt.getMonth() + validityMonths);

            const [existingRenewal] = await db
              .select({ id: certificateRenewalsTable.id })
              .from(certificateRenewalsTable)
              .where(eq(certificateRenewalsTable.orderId, order.id))
              .limit(1);

            if (!existingRenewal) {
              await db.insert(certificateRenewalsTable).values({
                orderId: order.id,
                customerName: order.customerName,
                customerCpfCnpj: order.customerCpfCnpj,
                customerEmail: order.customerEmail ?? null,
                certificateName: certRow?.name ?? "Certificado Digital",
                garPedido: order.garPedido,
                garProtocolo: newProtocolo ?? null,
                validityMonths,
                emittedAt,
                expiresAt,
              });
            }

            await db.update(ordersTable).set({
              garStatus: newGarStatus,
              garProtocolo: newProtocolo,
              garSyncedAt: new Date(),
              status: "completed",
            }).where(eq(ordersTable.id, order.id));

            await logEvent(order.id, "certificate_emitted", `Certificado emitido (sync automático) — status GAR: ${newGarStatus}`, { garStatus: newGarStatus, protocolo: newProtocolo });
            await logEvent(order.id, "order_completed", "Pedido concluído automaticamente — certificado emitido detectado pelo scheduler");

            notifyOrderStatus({
              to: order.customerEmail,
              phone: order.customerPhone,
              customerName: order.customerName,
              orderNumber: order.orderNumber,
              status: "completed",
              certName: certRow?.name,
              protocolNumber: newProtocolo ?? undefined,
            }).catch((err: unknown) => logger.error({ err }, "GAR status sync: erro ao notificar conclusão"));

            logger.info({ orderId: order.id, garStatus: newGarStatus }, "GAR status sync: certificado emitido — pedido concluído automaticamente");

            // Loyalty: incrementar cartela do contador
            if (order.userId) {
              const { incrementLoyaltySlot } = await import("./loyalty");
              incrementLoyaltySlot(order.userId, order.id).catch((err: unknown) => logger.error({ err }, "Loyalty: erro ao incrementar slot (scheduler)"));
            }

          } else if (newGarStatus !== order.garStatus) {
            // Status mudou mas ainda não emitido — apenas atualizar
            await db.update(ordersTable).set({
              garStatus: newGarStatus,
              garProtocolo: newProtocolo,
              garSyncedAt: new Date(),
            }).where(eq(ordersTable.id, order.id));
            await logEvent(order.id, "gar_status_updated", `Status GAR atualizado (sync automático): ${order.garStatus ?? "—"} → ${newGarStatus}`, { garStatus: newGarStatus });
            logger.info({ orderId: order.id, from: order.garStatus, to: newGarStatus }, "GAR status sync: status atualizado");
          }
        } catch (err) {
          logger.error({ err, orderId: order.id }, "GAR status sync: erro ao atualizar pedido com protocolo");
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "GAR protocol sync: erro geral");
  } finally {
    garProtocolSyncRunning = false;
  }
}

// ── MercadoPago Payment Sync ──────────────────────────────────────────────────
// Roda a cada 2 minutos, verificando todos os pedidos pending_payment com
// mpPaymentId na API do MP e atualizando automaticamente quando aprovado.
let mpSyncRunning = false;

async function syncMercadoPagoPayments() {
  if (mpSyncRunning) return;
  mpSyncRunning = true;
  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    const mpToken = settings?.mpAccessToken ?? "";
    if (!mpToken) return;

    // Busca pedidos com pagamento pendente que já tem mpPaymentId (PIX gerado)
    const pending = await db
      .select({ order: ordersTable, certName: certificatesTable.name })
      .from(ordersTable)
      .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
      .where(and(
        eq(ordersTable.status, "pending_payment"),
        isNotNull(ordersTable.mpPaymentId),
      ));

    if (pending.length === 0) return;

    logger.info({ count: pending.length }, "MP sync: verificando pagamentos pendentes");

    for (const { order, certName } of pending) {
      if (!order.mpPaymentId) continue;
      try {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${order.mpPaymentId}`, {
          headers: { Authorization: `Bearer ${mpToken}` },
        });
        if (!mpRes.ok) continue;

        const payment = await mpRes.json() as { status: string };
        if (payment.status !== "approved") continue;

        // Pagamento aprovado — atualizar status no DB
        await db.update(ordersTable)
          .set({ status: "paid", mpPaymentId: order.mpPaymentId })
          .where(eq(ordersTable.id, order.id));

        logger.info({ orderId: order.id, orderNumber: order.orderNumber }, "MP sync: pedido marcado como PAGO");

        // Notificar cliente
        const responsiblePhone = order.userId
          ? await db.select({ phone: usersTable.phone }).from(usersTable)
              .where(eq(usersTable.id, order.userId)).limit(1)
              .then(r => r[0]?.phone ?? null)
          : null;

        notifyOrderStatus({
          to: order.customerEmail,
          phone: order.customerPhone,
          responsiblePhone,
          customerName: order.customerName,
          orderNumber: order.orderNumber,
          status: "paid",
          total: parseFloat(order.total),
          certName: certName ?? undefined,
        }).catch(err => logger.error({ err, orderId: order.id }, "MP sync: erro ao notificar"));

        // Disparar registro automático no provedor ativo
        const activeProvider = settings?.activeProvider ?? "gestaoar";
        if (activeProvider === "gestaoar") {
          const { garAutoComprar } = await import("./gar-auto");
          garAutoComprar(order.id).catch(err => logger.error({ err, orderId: order.id }, "MP sync: erro garAutoComprar"));
        } else {
          const { swAutoComprar } = await import("./sw-auto");
          swAutoComprar(order.id).catch(err => logger.error({ err, orderId: order.id }, "MP sync: erro swAutoComprar"));
        }
      } catch (err) {
        logger.error({ err, orderId: order.id }, "MP sync: erro ao verificar pedido");
      }
    }
  } catch (err) {
    logger.error({ err }, "MP sync: erro geral");
  } finally {
    mpSyncRunning = false;
  }
}

// ── Daily Sales Report ────────────────────────────────────────────────────────
const SALES_REPORT_TO = "willianlealusa@gmail.com";

async function sendDailySalesReportJob() {
  try {
    // Ontem no horário de Brasília (UTC-3)
    const nowBrt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const yesterday = new Date(nowBrt);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const dayStart = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 3, 0, 0)); // 00:00 BRT = 03:00 UTC
    const dayEnd   = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate() + 1, 3, 0, 0));

    const rows = await db
      .select({ total: ordersTable.total, certName: certificatesTable.name })
      .from(ordersTable)
      .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
      .where(and(
        eq(ordersTable.status, "paid"),
        gte(ordersTable.createdAt, dayStart),
        lt(ordersTable.createdAt, dayEnd),
      ));

    let cpfCount = 0, cnpjCount = 0, otherCount = 0, totalValue = 0;
    for (const r of rows) {
      const name = (r.certName ?? "").toUpperCase();
      if (name.includes("CPF"))       cpfCount++;
      else if (name.includes("CNPJ")) cnpjCount++;
      else                            otherCount++;
      totalValue += parseFloat(r.total ?? "0");
    }

    await sendDailySalesReport({
      to: SALES_REPORT_TO,
      date: yesterday,
      cpfCount,
      cnpjCount,
      otherCount,
      totalValue,
      orderCount: rows.length,
    });

    logger.info({ cpfCount, cnpjCount, otherCount, totalValue, to: SALES_REPORT_TO }, "Daily sales report sent");
  } catch (err) {
    logger.error({ err }, "Daily sales report: erro ao enviar");
  }
}

// ── WhatsApp Connection Monitor ──────────────────────────────────────────────
const WA_ALERT_NUMBER = "14076751467";
let lastWaStatus: "open" | "closed" | "unknown" = "unknown";
let waAlertCooldown = false;

async function checkWhatsAppConnection() {
  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    const url = settings?.evolutionUrl;
    const apiKey = settings?.evolutionApiKey;
    const instance = settings?.evolutionInstance;
    if (!url || !apiKey || !instance) return;

    const resp = await fetch(`${url.replace(/\/$/, "")}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
    });
    if (!resp.ok) return;

    const data = await resp.json() as Array<{ connectionStatus?: string }>;
    const inst = Array.isArray(data) ? data[0] : data;
    const status = (inst?.connectionStatus ?? "").toLowerCase();
    const isOpen = status === "open";

    if (!isOpen && lastWaStatus === "open" && !waAlertCooldown) {
      waAlertCooldown = true;
      setTimeout(() => { waAlertCooldown = false; }, 30 * 60_000); // cooldown 30 min

      const { sendWhatsApp } = await import("./evolution");
      await sendWhatsApp(
        { evolutionUrl: url, evolutionApiKey: apiKey, evolutionInstance: instance },
        WA_ALERT_NUMBER,
        `⚠️ *LealCert — Alerta WhatsApp*\n\nA instância *${instance}* está DESCONECTADA (status: ${status || "desconhecido"}).\n\nAcesse o painel da Evolution API e escaneie o QR Code para reconectar:\n${url}`,
      ).catch(err => logger.error({ err }, "WA monitor: falha ao enviar alerta"));

      logger.warn({ instance, status }, "WA monitor: instância desconectada — alerta enviado");
    } else if (isOpen && lastWaStatus !== "open") {
      logger.info({ instance }, "WA monitor: instância reconectada");
      if (lastWaStatus !== "unknown") {
        const { sendWhatsApp } = await import("./evolution");
        await sendWhatsApp(
          { evolutionUrl: url, evolutionApiKey: apiKey, evolutionInstance: instance },
          WA_ALERT_NUMBER,
          `✅ *LealCert — WhatsApp Reconectado*\n\nA instância *${instance}* está ONLINE novamente.`,
        ).catch(() => {/* silencioso */});
      }
    }

    lastWaStatus = isOpen ? "open" : "closed";
  } catch (err) {
    logger.error({ err }, "WA monitor: erro ao verificar conexão");
  }
}

/** Calcula ms até a próxima 08:00 horário de Brasília (UTC-3). */
function msUntilNext8amBrt(): number {
  const nowUtc = Date.now();
  const nowBrt = new Date(nowUtc - 3 * 60 * 60 * 1000);
  const next8 = new Date(Date.UTC(
    nowBrt.getUTCFullYear(), nowBrt.getUTCMonth(), nowBrt.getUTCDate(),
    11, 0, 0, // 08:00 BRT = 11:00 UTC
  ));
  if (nowUtc >= next8.getTime()) next8.setUTCDate(next8.getUTCDate() + 1);
  return next8.getTime() - nowUtc;
}

export function startScheduler() {
  logger.info("Marketing scheduler started (60s interval)");
  setInterval(checkScheduledCampaigns, 60_000);
  checkScheduledCampaigns().catch(err => logger.error({ err }, "Initial scheduler check error"));

  logger.info("Safeweb status sync started (5min interval)");
  setInterval(syncSafewebStatuses, 5 * 60_000);
  setTimeout(() => syncSafewebStatuses().catch(err => logger.error({ err }, "Initial Safeweb sync error")), 30_000);

  // Auto-desbloquear IPs do Brasil após 4h (roda a cada 10 minutos)
  const runAutoUnblock = () => import("./ip-security").then(m => m.autoUnblockExpiredIps()).catch(err => logger.error({ err }, "ip-security: auto-unblock error"));
  setInterval(runAutoUnblock, 10 * 60_000);
  setTimeout(runAutoUnblock, 60_000);

  // Sincronização de protocolos GAR — a cada 5 minutos
  setInterval(syncGarProtocols, 5 * 60_000);
  setTimeout(() => syncGarProtocols().catch(err => logger.error({ err }, "GAR protocol sync: erro inicial")), 5_000);
  logger.info("GAR protocol sync started (5min interval)");

  // Sincronização automática de pagamentos MercadoPago — a cada 2 minutos
  setInterval(syncMercadoPagoPayments, 2 * 60_000);
  setTimeout(() => syncMercadoPagoPayments().catch(err => logger.error({ err }, "MP sync: erro inicial")), 15_000);
  logger.info("MercadoPago payment sync started (2min interval)");

  // Monitor de conexão WhatsApp — verifica a cada 5 minutos
  setInterval(checkWhatsAppConnection, 5 * 60_000);
  setTimeout(() => checkWhatsAppConnection().catch(err => logger.error({ err }, "WA monitor: erro inicial")), 10_000);
  logger.info("WhatsApp connection monitor started (5min interval)");

  // Polling IMAP — lê respostas de email a cada 2 minutos
  startImapPoller();

  // E-mail de vendas do dia — dispara às 08:00 BRT, depois a cada 24h
  const msFirst = msUntilNext8amBrt();
  logger.info({ nextInMs: msFirst, nextInMin: Math.round(msFirst / 60_000) }, "Daily sales report scheduled");
  setTimeout(() => {
    sendDailySalesReportJob().catch(err => logger.error({ err }, "Daily sales report: erro inicial"));
    setInterval(sendDailySalesReportJob, 24 * 60 * 60_000);
  }, msFirst);
}
