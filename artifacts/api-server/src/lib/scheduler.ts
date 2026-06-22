import { eq, lte, and, isNotNull, notInArray, gte, lt } from "drizzle-orm";
import { db, marketingCampaignsTable, ordersTable, settingsTable, certificatesTable, type InsertOrder } from "@workspace/db";
import { logger } from "./logger";
import { dispatchCampaign } from "../routes/marketing";
import { sendDailySalesReport } from "./email";

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
      await db.update(marketingCampaignsTable).set({ status: "sending" }).where(eq(marketingCampaignsTable.id, campaign.id));
      dispatchCampaign(campaign.id).catch(err => logger.error({ err, campaignId: campaign.id }, "Scheduled campaign dispatch error"));
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

  // E-mail de vendas do dia — dispara às 08:00 BRT, depois a cada 24h
  const msFirst = msUntilNext8amBrt();
  logger.info({ nextInMs: msFirst, nextInMin: Math.round(msFirst / 60_000) }, "Daily sales report scheduled");
  setTimeout(() => {
    sendDailySalesReportJob().catch(err => logger.error({ err }, "Daily sales report: erro inicial"));
    setInterval(sendDailySalesReportJob, 24 * 60 * 60_000);
  }, msFirst);
}
