import { eq, lte, and, isNotNull, notInArray } from "drizzle-orm";
import { db, marketingCampaignsTable, ordersTable, settingsTable, certificatesTable, type InsertOrder } from "@workspace/db";
import { logger } from "./logger";
import { dispatchCampaign } from "../routes/marketing";

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
          info = await swAgendaInformacoes(sw, agendId) as Record<string, unknown>;
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

export function startScheduler() {
  logger.info("Marketing scheduler started (60s interval)");
  setInterval(checkScheduledCampaigns, 60_000);
  checkScheduledCampaigns().catch(err => logger.error({ err }, "Initial scheduler check error"));

  logger.info("Safeweb status sync started (5min interval)");
  setInterval(syncSafewebStatuses, 5 * 60_000);
  // Primeira verificação após 30s para não sobrecarregar o boot
  setTimeout(() => syncSafewebStatuses().catch(err => logger.error({ err }, "Initial Safeweb sync error")), 30_000);
}
