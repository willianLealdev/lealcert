/**
 * Scheduler do sistema de discagem.
 *
 * Funciona sem Redis — usa fila em memória + DB para persistência.
 * O DB é a fonte de verdade: o sistema nunca "começa do zero" pois
 * consulta apenas contatos com status pendente/retry.
 */

import { and, or, eq, lte, isNull, inArray, sql, lt, isNotNull } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { discagemCampaignsTable, discagemCallsTable, marketingContactsTable } from "@workspace/db";
import { initiateCall, hangupCall } from "./twilio-client";
import { getDiscagemSettings } from "./settings-reader";
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
  const { publicHostname } = await getDiscagemSettings();
  const hostname = publicHostname || process.env.PUBLIC_HOSTNAME || "";
  const baseUrl = `${hostname}/api/discagem`;

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
      // Marca a call como falhou antes de pausar a campanha
      await db
        .update(discagemCallsTable)
        .set({ status: "failed", error: (err as Error).message, endedAt: new Date() })
        .where(eq(discagemCallsTable.id, callRecord.callId));
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

// ── Reconcilia ligações travadas consultando / forçando hangup ────
async function reconcileStuckCalls(): Promise<void> {
  const cfg = await getDiscagemSettings();
  const { twilioAccountSid, twilioAuthToken } = cfg;
  if (!twilioAccountSid || !twilioAuthToken) return;

  const authHeader = `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64")}`;

  // Threshold 1 — 20s: webhook normal não chegou, consulta status no Twilio
  const threshold20s  = new Date(Date.now() - 20  * 1000);
  // Threshold 2 — 3 min: call ainda in_progress → forçar hangup (Gather aberto)
  const threshold3min = new Date(Date.now() - 3 * 60 * 1000);

  const stuckWithSid = await db
    .select({
      id:           discagemCallsTable.id,
      twilioCallSid: discagemCallsTable.twilioCallSid,
      status:       discagemCallsTable.status,
      startedAt:    discagemCallsTable.startedAt,
      campaignId:   discagemCallsTable.campaignId,
    })
    .from(discagemCallsTable)
    .where(
      and(
        inArray(discagemCallsTable.status, ["dialing", "in_progress"]),
        isNotNull(discagemCallsTable.twilioCallSid),
        // startedAt NULL = rota de teste não setou; trata como stuck imediatamente
        or(
          lt(discagemCallsTable.startedAt, threshold20s),
          isNull(discagemCallsTable.startedAt),
        ),
      )
    );

  for (const call of stuckWithSid) {
    try {
      // ── Fase 1: consulta status atual no Twilio ─────────────────
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls/${call.twilioCallSid}.json`,
        { headers: { Authorization: authHeader } }
      );
      if (!res.ok) continue;
      const data = await res.json() as { status: string; duration?: string | number };
      const twilioStatus = data.status;
      const twilioDuration = data.duration ? parseInt(String(data.duration), 10) : null;

      let newStatus: string | null = null;

      if (twilioStatus === "completed") {
        // Twilio fechou normalmente — marca como answered
        newStatus = "answered";
      } else if (twilioStatus === "busy") {
        newStatus = "no_answer";
      } else if (twilioStatus === "no-answer") {
        newStatus = "no_answer";
      } else if (twilioStatus === "failed" || twilioStatus === "canceled") {
        newStatus = "failed";
      } else if (
        (twilioStatus === "in-progress" || twilioStatus === "ringing") &&
        call.startedAt &&
        call.startedAt < threshold3min
      ) {
        // ── Fase 2: call aberta há mais de 3 min → force hangup ──
        console.log(`[discagem-reconcile] Call ${call.id} presa em "${twilioStatus}" há >3min → forçando hangup`);
        try {
          await hangupCall(call.twilioCallSid!);
        } catch (e) {
          console.warn(`[discagem-reconcile] hangup falhou para ${call.twilioCallSid}:`, e);
        }
        // Marca localmente como answered (estava em conversa) ou failed
        newStatus = call.status === "in_progress" ? "answered" : "failed";
      }

      if (newStatus) {
        console.log(`[discagem-reconcile] Call ${call.id} (${call.twilioCallSid}) → Twilio="${twilioStatus}" dur=${twilioDuration}s → marcando ${newStatus}`);
        await db.update(discagemCallsTable)
          .set({
            status: newStatus as any,
            endedAt: new Date(),
            ...(twilioDuration !== null && twilioDuration > 0 ? { durationSeconds: twilioDuration } : {}),
          })
          .where(eq(discagemCallsTable.id, call.id));

        markCallInactive(call.id);
      }
    } catch (err) {
      console.error(`[discagem-reconcile] Erro call ${call.id}:`, err);
    }
  }

  // Calls SEM SID travadas em dialing há mais de 20s → falhou antes do Twilio
  await db.update(discagemCallsTable)
    .set({ status: "failed", error: "Sem SID Twilio após 20s — falhou antes de iniciar", endedAt: new Date() })
    .where(
      and(
        eq(discagemCallsTable.status, "dialing"),
        isNull(discagemCallsTable.twilioCallSid),
        lt(discagemCallsTable.startedAt, threshold20s),
      )
    );
}

// ── Tick principal do scheduler ──────────────────────────────────
async function schedulerTick(): Promise<void> {
  try {
    // Reconcilia ligações que travaram sem receber callback do Twilio
    await reconcileStuckCalls();

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

  // Extrai DDD de um número brasileiro (11 dígitos após +55/55 ou 2 primeiros dígitos)
  function extractDdd(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    // Remove código do país 55 ou +55
    const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
    return local.slice(0, 2);
  }

  // Filtra contatos sem telefone
  const withPhone = contacts.filter(c => c.phone && c.phone.trim() !== "");

  // Filtra por DDD (se configurado)
  const allowedDdds: string[] | null = campaign.filterDdd
    ? campaign.filterDdd.split(",").map(d => d.trim()).filter(Boolean)
    : null;

  const valid = allowedDdds && allowedDdds.length > 0
    ? withPhone.filter(c => allowedDdds.includes(extractDdd(c.phone!)))
    : withPhone;

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
