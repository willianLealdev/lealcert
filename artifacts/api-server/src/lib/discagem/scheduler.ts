/**
 * Scheduler do sistema de discagem.
 *
 * Funciona sem Redis — usa fila em memória + DB para persistência.
 * O DB é a fonte de verdade: o sistema nunca "começa do zero" pois
 * consulta apenas contatos com status pendente/retry.
 */

import { and, eq, lte, isNull, inArray, sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { discagemCampaignsTable, discagemCallsTable, marketingContactsTable } from "@workspace/db";
import { initiateCall } from "./twilio-client";
import { detectCreditError } from "./ai-agent";
import {
  DISCAGEM_TIMEZONE,
  SCHEDULER_INTERVAL_MS,
  DAY_MAP,
} from "./config";

// ── Estado em memória ──────────────────────────────────────────────
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let activeCalls = new Set<number>(); // callIds atualmente em andamento

export function getActiveCalls(): number[] {
  return [...activeCalls];
}

export function markCallActive(callId: number) {
  activeCalls.add(callId);
}

export function markCallInactive(callId: number) {
  activeCalls.delete(callId);
}

// ── Janela de horário ─────────────────────────────────────────────
function isWithinWindow(campaign: typeof discagemCampaignsTable.$inferSelect): boolean {
  const now = new Date();
  const br = new Intl.DateTimeFormat("en-US", {
    timeZone: DISCAGEM_TIMEZONE,
    weekday: "short",
    hour: "numeric",
    hour12: false,
    minute: "numeric",
  }).formatToParts(now);

  const dayStr = br.find(p => p.type === "weekday")?.value?.toLowerCase() ?? "";
  const hour = parseInt(br.find(p => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(br.find(p => p.type === "minute")?.value ?? "0", 10);
  const timeDecimal = hour + minute / 60;

  // Verifica dia da semana
  let allowedDays: string[] = [];
  try {
    allowedDays = JSON.parse(campaign.windowDays ?? "[]");
  } catch { allowedDays = ["mon", "tue", "wed", "thu"]; }

  const dayAbbrevMap: Record<string, string> = {
    sun: "sun", mon: "mon", tue: "tue", wed: "wed",
    thu: "thu", fri: "fri", sat: "sat",
  };
  const dayAbbrev = dayAbbrevMap[dayStr] ?? dayStr.slice(0, 3);

  if (!allowedDays.includes(dayAbbrev)) return false;

  // Verifica janela de horário
  const inMorning = timeDecimal >= campaign.windowMorningStart && timeDecimal < campaign.windowMorningEnd;
  const inAfternoon = timeDecimal >= campaign.windowAfternoonStart && timeDecimal < campaign.windowAfternoonEnd;

  return inMorning || inAfternoon;
}

// ── Busca próximos contatos para discar ───────────────────────────
async function fetchNextContacts(campaign: typeof discagemCampaignsTable.$inferSelect, limit: number) {
  const now = new Date();

  // Busca calls pendentes ou em retry que estejam prontos
  const pendingCalls = await db
    .select({
      callId: discagemCallsTable.id,
      phone: discagemCallsTable.phoneNumber,
      name: discagemCallsTable.contactName,
      contactId: discagemCallsTable.contactId,
    })
    .from(discagemCallsTable)
    .where(
      and(
        eq(discagemCallsTable.campaignId, campaign.id),
        inArray(discagemCallsTable.status, ["queued"]),
      )
    )
    .limit(limit);

  return pendingCalls;
}

// ── Dispara uma chamada ───────────────────────────────────────────
async function fireCall(
  campaign: typeof discagemCampaignsTable.$inferSelect,
  callRecord: { callId: number; phone: string; name: string | null; contactId: number | null },
): Promise<void> {
  const baseUrl = `${process.env.PUBLIC_HOSTNAME}/api/discagem`;

  try {
    await db
      .update(discagemCallsTable)
      .set({ status: "dialing", startedAt: new Date() })
      .where(eq(discagemCallsTable.id, callRecord.callId));

    markCallActive(callRecord.callId);

    const twilioSid = await initiateCall({
      to: callRecord.phone,
      callbackBaseUrl: baseUrl,
      callId: callRecord.callId,
      campaignId: campaign.id,
    });

    await db
      .update(discagemCallsTable)
      .set({ twilioCallSid: twilioSid, status: "dialing" })
      .where(eq(discagemCallsTable.id, callRecord.callId));

  } catch (err: unknown) {
    markCallInactive(callRecord.callId);

    const creditErr = (err as any)?.creditError as string | undefined;
    if (creditErr) {
      // Pausa campanha por falta de crédito
      await pauseCampaignForCredit(campaign.id, creditErr, (err as Error).message);
      return;
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    await db
      .update(discagemCallsTable)
      .set({ status: "failed", error: errMsg, endedAt: new Date() })
      .where(eq(discagemCallsTable.id, callRecord.callId));
  }
}

// ── Pausa campanha por crédito esgotado ──────────────────────────
export async function pauseCampaignForCredit(
  campaignId: number,
  api: string,
  reason: string,
): Promise<void> {
  await db
    .update(discagemCampaignsTable)
    .set({
      status: "credit_error",
      pausedApi: api,
      pauseReason: `Créditos insuficientes na API ${api}: ${reason}`,
    })
    .where(eq(discagemCampaignsTable.id, campaignId));
}

// ── Tick principal do scheduler ──────────────────────────────────
async function schedulerTick(): Promise<void> {
  try {
    // Busca todas campanhas em estado "running"
    const runningCampaigns = await db
      .select()
      .from(discagemCampaignsTable)
      .where(eq(discagemCampaignsTable.status, "running"));

    for (const campaign of runningCampaigns) {
      if (!isWithinWindow(campaign)) continue;

      // Quantas chamadas simultâneas ainda posso fazer
      const currentActive = activeCalls.size;
      const slots = campaign.maxConcurrentCalls - currentActive;
      if (slots <= 0) continue;

      const contacts = await fetchNextContacts(campaign, slots);

      if (contacts.length === 0) {
        // Verifica se ainda há chamadas em andamento
        const inProgress = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(discagemCallsTable)
          .where(
            and(
              eq(discagemCallsTable.campaignId, campaign.id),
              inArray(discagemCallsTable.status, ["queued", "dialing", "in_progress"]),
            )
          );
        const total = inProgress[0]?.count ?? 0;
        if (total === 0) {
          // Campanha concluída
          await db
            .update(discagemCampaignsTable)
            .set({ status: "completed", completedAt: new Date() })
            .where(eq(discagemCampaignsTable.id, campaign.id));
        }
        continue;
      }

      // Dispara em paralelo (até slots disponíveis)
      await Promise.allSettled(contacts.map(c => fireCall(campaign, c)));
    }
  } catch (err) {
    console.error("[discagem-scheduler] Erro no tick:", err);
  }
}

// ── Popula calls para uma campanha quando ela é iniciada ─────────
export async function populateCampaignCalls(
  campaign: typeof discagemCampaignsTable.$inferSelect,
): Promise<number> {
  // Se já tem calls, não repopula (garante retomada sem recomeçar)
  const existing = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(discagemCallsTable)
    .where(eq(discagemCallsTable.campaignId, campaign.id));

  if ((existing[0]?.count ?? 0) > 0) return existing[0]?.count ?? 0;

  // Busca contatos alvo
  let contacts: { id: number; phone: string | null; name: string }[] = [];

  if (campaign.targetType === "manual_number" && campaign.manualNumber) {
    contacts = [{ id: 0, phone: campaign.manualNumber, name: "Manual" }];
  } else {
    let query = db
      .select({ id: marketingContactsTable.id, phone: marketingContactsTable.phone, name: marketingContactsTable.name })
      .from(marketingContactsTable)
      .where(eq(marketingContactsTable.status, "active"))
      .$dynamic();

    if (campaign.targetType === "clientes") {
      query = query.where(eq(marketingContactsTable.type, "cliente"));
    } else if (campaign.targetType === "contadores") {
      query = query.where(eq(marketingContactsTable.type, "contador"));
    } else if (campaign.targetType === "contact_ids" && campaign.targetContactIds) {
      const ids = JSON.parse(campaign.targetContactIds) as number[];
      query = query.where(inArray(marketingContactsTable.id, ids));
    }

    contacts = await query;
  }

  // Filtra contatos sem telefone
  const valid = contacts.filter(c => c.phone && c.phone.trim() !== "");

  if (valid.length === 0) return 0;

  // Insere calls em batch
  await db.insert(discagemCallsTable).values(
    valid.map(c => ({
      campaignId: campaign.id,
      contactId: c.id > 0 ? c.id : null,
      phoneNumber: c.phone!,
      contactName: c.name,
      status: "queued",
      attemptNumber: 1,
    }))
  );

  return valid.length;
}

// ── Controle público ─────────────────────────────────────────────
export function startScheduler(): void {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(schedulerTick, SCHEDULER_INTERVAL_MS);
  console.log("[discagem-scheduler] Iniciado (interval %dms)", SCHEDULER_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[discagem-scheduler] Parado");
  }
}
