/**
 * Rotas do sistema de discagem automática com IA.
 *
 * Públicas (Twilio webhooks):
 *   POST /api/discagem/voice/:callId          — TwiML inicial
 *   POST /api/discagem/voice/:callId/speech   — resposta da IA
 *   POST /api/discagem/status/:callId         — status callback Twilio
 *   POST /api/discagem/amd/:callId            — AMD callback
 *   GET  /api/discagem/audio/:id              — serve arquivo de áudio TTS
 *
 * Admin (requireAdmin):
 *   GET    /api/admin/discagem/campaigns
 *   POST   /api/admin/discagem/campaigns
 *   PUT    /api/admin/discagem/campaigns/:id
 *   DELETE /api/admin/discagem/campaigns/:id
 *   POST   /api/admin/discagem/campaigns/:id/start
 *   POST   /api/admin/discagem/campaigns/:id/pause
 *   POST   /api/admin/discagem/campaigns/:id/resume
 *   GET    /api/admin/discagem/campaigns/:id/status
 *   GET    /api/admin/discagem/campaigns/:id/calls
 *   POST   /api/admin/discagem/test-call
 *   GET    /api/admin/discagem/contacts        — lista contatos disponíveis
 */

import { Router } from "express";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { db } from "@workspace/db";
import {
  discagemCampaignsTable,
  discagemCallsTable,
  marketingContactsTable,
} from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { runAgentTurn, detectCreditError } from "../lib/discagem/ai-agent";
import { synthesize, audioUrl, TMP_AUDIO_DIR } from "../lib/discagem/tts";
import { invalidateDiscagemSettingsCache } from "../lib/discagem/settings-reader";
import { getFillerUrl, initFillerAudio } from "../lib/discagem/filler-audio";
import {
  twimlOpeningGather,
  twimlReplyGather,
  twimlHangup,
  twimlVoicemailHangup,
  initiateCall,
  hangupCall,
} from "../lib/discagem/twilio-client";
import {
  startScheduler,
  stopScheduler,
  populateCampaignCalls,
  markCallInactive,
  pauseCampaignForCredit,
} from "../lib/discagem/scheduler";
import { AGENT_SYSTEM_PROMPT } from "../lib/discagem/config";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────
/** Normaliza filtro de DDD: aceita "11,17" ou ["11","17"] → "11,17" ou null */
function normalizeDdd(v: string | string[] | null | undefined): string | null {
  if (!v) return null;
  const raw = Array.isArray(v) ? v.join(",") : v;
  const cleaned = raw.split(",").map(d => d.trim().replace(/\D/g, "")).filter(d => d.length === 2);
  return cleaned.length > 0 ? cleaned.join(",") : null;
}

// ─── Mapa em memória: callId → histórico de conversa ─────────────
const conversationCache = new Map<number, { role: "user" | "assistant"; text: string; ts: string }[]>();

function getConvHistory(callId: number) {
  if (!conversationCache.has(callId)) conversationCache.set(callId, []);
  return conversationCache.get(callId)!;
}

// ─── Mapa de resultados pendentes (filler pattern) ────────────────
// Após o /speech disparar processamento em background, armazena aqui
// até o /reply buscar. TTL automático: limpo quando /reply consome.
interface PendingResult {
  promise: Promise<PendingPayload>;
  startedAt: number;
}
interface PendingPayload {
  audioUrl: string;
  shouldEndCall: boolean;
  isOptOut: boolean;
  history: { role: "user" | "assistant"; text: string; ts: string }[];
  err?: unknown;
}

const pendingResults = new Map<number, PendingResult>();

// Garante que fillers são gerados antes da primeira chamada real
// (dispara em background no import do módulo)
initFillerAudio().catch(e => console.warn("[discagem] initFillerAudio falhou:", e));

// ─────────────────────────────────────────────────────────────────
// WEBHOOK: TwiML inicial (Twilio chama quando a ligação conecta)
// ─────────────────────────────────────────────────────────────────
router.post("/discagem/voice/:callId", async (req, res): Promise<void> => {
  const callId = parseInt(Array.isArray(req.params.callId) ? req.params.callId[0] : req.params.callId, 10);
  if (isNaN(callId)) { res.status(400).send("Invalid callId"); return; }

  try {
    const [call] = await db.select().from(discagemCallsTable).where(eq(discagemCallsTable.id, callId));
    if (!call) { res.status(404).send("Call not found"); return; }

    const [campaign] = await db.select().from(discagemCampaignsTable).where(eq(discagemCampaignsTable.id, call.campaignId!));
    if (!campaign) { res.type("text/xml").send(twimlHangup()); return; }

    // Atualiza status
    await db.update(discagemCallsTable).set({ status: "in_progress" }).where(eq(discagemCallsTable.id, callId));

    // Gera abertura da conversa via IA
    const openingHistory = [{ role: "user" as const, text: "[INÍCIO DA LIGAÇÃO]", ts: new Date().toISOString() }];
    const aiResp = await runAgentTurn(openingHistory, campaign.aiModel as any, (campaign as any).agentName ?? "Willian", undefined);

    getConvHistory(callId).push({ role: "assistant", text: aiResp.text, ts: new Date().toISOString() });

    // Gera áudio da abertura
    const { id: ttsId, providerUsed: ttsUsed } = await synthesize(aiResp.text, campaign.ttsProvider as any, campaign.ttsVoiceId ?? undefined);
    const url = await audioUrl(ttsId);

    const { publicHostname } = await import("../lib/discagem/settings-reader").then(m => m.getDiscagemSettings());
    const gatherAction = `${publicHostname || process.env.PUBLIC_HOSTNAME}/api/discagem/voice/${callId}/speech`;
    res.type("text/xml").send(twimlOpeningGather(url, gatherAction));
  } catch (err: unknown) {
    console.error("[discagem-voice] Erro no TwiML inicial:", err);
    const creditApi = (err as any)?.creditError as string | undefined;
    if (creditApi) {
      const [call] = await db.select({ campaignId: discagemCallsTable.campaignId }).from(discagemCallsTable).where(eq(discagemCallsTable.id, callId));
      if (call?.campaignId) await pauseCampaignForCredit(call.campaignId, creditApi, (err as Error).message);
    }
    res.type("text/xml").send(twimlHangup());
  }
});

// ─────────────────────────────────────────────────────────────────
// WEBHOOK: Speech result → toca filler IMEDIATAMENTE + processa em background
// ─────────────────────────────────────────────────────────────────
router.post("/discagem/voice/:callId/speech", async (req, res): Promise<void> => {
  const callId = parseInt(Array.isArray(req.params.callId) ? req.params.callId[0] : req.params.callId, 10);
  const speechResult: string = req.body?.SpeechResult ?? "";
  const hangupParam = req.query.hangup === "1";

  if (hangupParam || !speechResult) {
    res.type("text/xml").send(twimlHangup());
    return;
  }

  // ── 1. Busca dados necessários ──────────────────────────────────
  const [call] = await db.select().from(discagemCallsTable).where(eq(discagemCallsTable.id, callId));
  if (!call) { res.type("text/xml").send(twimlHangup()); return; }

  const [campaign] = await db.select().from(discagemCampaignsTable).where(eq(discagemCampaignsTable.id, call.campaignId!));
  if (!campaign) { res.type("text/xml").send(twimlHangup()); return; }

  const { publicHostname } = await import("../lib/discagem/settings-reader").then(m => m.getDiscagemSettings());
  const base = publicHostname || process.env.PUBLIC_HOSTNAME || "";

  // ── 2. Dispara IA + TTS em background (não aguarda) ─────────────
  const history = getConvHistory(callId);
  history.push({ role: "user", text: speechResult, ts: new Date().toISOString() });

  const processingPromise: Promise<PendingPayload> = (async () => {
    const aiResp = await runAgentTurn(history, campaign.aiModel as any, (campaign as any).agentName ?? "Willian", undefined);
    history.push({ role: "assistant", text: aiResp.text, ts: new Date().toISOString() });
    const { id: ttsId } = await synthesize(aiResp.text, campaign.ttsProvider as any, campaign.ttsVoiceId ?? undefined);
    const url = await audioUrl(ttsId);
    return { audioUrl: url, shouldEndCall: aiResp.shouldEndCall, isOptOut: aiResp.isOptOut, history };
  })().catch(err => ({ audioUrl: "", shouldEndCall: true, isOptOut: false, history, err }));

  pendingResults.set(callId, { promise: processingPromise, startedAt: Date.now() });

  // ── 3. Responde IMEDIATAMENTE com filler + redirect ──────────────
  // O Twilio toca o filler (~0.8s) enquanto a IA processa em paralelo.
  // Quando o Twilio chamar /reply, o resultado já deve estar pronto.
  const fillerGroup = speechResult.length > 40 ? "thinking" : "ack";
  const fUrl = await getFillerUrl(fillerGroup);
  const replyUrl = `${base}/api/discagem/voice/${callId}/reply?attempt=1`;

  if (fUrl) {
    // Toca filler e redireciona para buscar resultado
    res.type("text/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${fUrl}</Play><Redirect method="POST">${replyUrl}</Redirect></Response>`
    );
  } else {
    // Sem filler disponível ainda — usa Pause curto como fallback
    res.type("text/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="1"/><Redirect method="POST">${replyUrl}</Redirect></Response>`
    );
  }
});

// ─────────────────────────────────────────────────────────────────
// WEBHOOK: Reply — busca resultado do background e responde com TwiML real
// Chamado pelo Twilio após o filler terminar (~0.8–1.2s depois)
// ─────────────────────────────────────────────────────────────────
router.post("/discagem/voice/:callId/reply", async (req, res): Promise<void> => {
  const callId = parseInt(Array.isArray(req.params.callId) ? req.params.callId[0] : req.params.callId, 10);
  const attempt = parseInt((req.query.attempt as string) ?? "1", 10);

  const pending = pendingResults.get(callId);
  if (!pending) {
    // Resultado não existe (chamada inválida ou já consumida)
    res.type("text/xml").send(twimlHangup());
    return;
  }

  const { publicHostname } = await import("../lib/discagem/settings-reader").then(m => m.getDiscagemSettings());
  const base = publicHostname || process.env.PUBLIC_HOSTNAME || "";

  // Aguarda o resultado, com timeout para não bloquear o Twilio (máx 5s extra)
  let payload: PendingPayload;
  try {
    payload = await Promise.race([
      pending.promise,
      new Promise<PendingPayload>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 5000)
      ),
    ]);
  } catch (err: unknown) {
    // Ainda processando ou erro → toca mais um filler e tenta novamente (máx 3 tentativas)
    if (attempt < 3) {
      const fUrl = await getFillerUrl("thinking");
      const nextUrl = `${base}/api/discagem/voice/${callId}/reply?attempt=${attempt + 1}`;
      if (fUrl) {
        res.type("text/xml").send(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${fUrl}</Play><Redirect method="POST">${nextUrl}</Redirect></Response>`
        );
      } else {
        res.type("text/xml").send(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="1"/><Redirect method="POST">${nextUrl}</Redirect></Response>`
        );
      }
      return;
    }
    // Timeout total (raro) — encerra com elegância
    pendingResults.delete(callId);
    res.type("text/xml").send(twimlHangup());
    return;
  }

  // Consome o resultado (remove do mapa)
  pendingResults.delete(callId);

  // Trata erros de crédito que vieram do background
  if (payload.err) {
    const creditApi = (payload.err as any)?.creditError as string | undefined;
    if (creditApi) {
      const [callRow] = await db.select({ campaignId: discagemCallsTable.campaignId })
        .from(discagemCallsTable).where(eq(discagemCallsTable.id, callId));
      if (callRow?.campaignId) await pauseCampaignForCredit(callRow.campaignId, creditApi, (payload.err as Error).message);
    }
    res.type("text/xml").send(twimlHangup());
    return;
  }

  // ── Resultado pronto — responde com TwiML real ───────────────────
  if (payload.shouldEndCall) {
    // Salva transcript e encerra
    const [callRow] = await db.select().from(discagemCallsTable).where(eq(discagemCallsTable.id, callId));
    await db.update(discagemCallsTable).set({
      transcript: JSON.stringify(payload.history),
      status: payload.isOptOut ? "optout" : "answered",
      outcome: payload.isOptOut ? "optout" : "answered",
    }).where(eq(discagemCallsTable.id, callId));

    if (payload.isOptOut && callRow?.contactId) {
      await db.update(marketingContactsTable)
        .set({ status: "optout" })
        .where(eq(marketingContactsTable.id, callRow.contactId));
    }

    res.type("text/xml").send(twimlHangup(payload.audioUrl));
    return;
  }

  const gatherAction = `${base}/api/discagem/voice/${callId}/speech`;
  res.type("text/xml").send(twimlReplyGather(payload.audioUrl, gatherAction));
});

// ─────────────────────────────────────────────────────────────────
// WEBHOOK: Status callback Twilio
// ─────────────────────────────────────────────────────────────────
router.post("/discagem/status/:callId", async (req, res): Promise<void> => {
  const callId = parseInt(Array.isArray(req.params.callId) ? req.params.callId[0] : req.params.callId, 10);
  const callStatus: string = req.body?.CallStatus ?? "";
  const duration: string = req.body?.CallDuration ?? "0";
  const recordingUrl: string = req.body?.RecordingUrl ?? "";

  res.sendStatus(204);

  try {
    const [call] = await db.select().from(discagemCallsTable).where(eq(discagemCallsTable.id, callId));
    if (!call) return;

    const history = getConvHistory(callId);
    conversationCache.delete(callId);
    markCallInactive(callId);

    let newStatus = call.status;
    let outcome = call.outcome;

    if (callStatus === "completed") {
      newStatus = history.length > 0 ? "answered" : "no_answer";
      outcome = history.length > 0 ? "answered" : "no_answer";
    } else if (callStatus === "no-answer" || callStatus === "busy") {
      newStatus = callStatus === "busy" ? "failed" : "no_answer";
      outcome = callStatus === "busy" ? "busy" : "no_answer";

      // Agenda retentativa se ainda não atingiu o limite
      const [campaign] = await db.select({ maxAttempts: discagemCampaignsTable.maxAttempts })
        .from(discagemCampaignsTable).where(eq(discagemCampaignsTable.id, call.campaignId!));

      if (call.attemptNumber < (campaign?.maxAttempts ?? 2)) {
        // Retry no próximo dia útil — cria novo call record
        const nextDay = getNextBusinessDay();
        await db.insert(discagemCallsTable).values({
          campaignId: call.campaignId,
          contactId: call.contactId,
          phoneNumber: call.phoneNumber,
          contactName: call.contactName,
          status: "queued",
          attemptNumber: call.attemptNumber + 1,
          retryAfter: nextDay,
        });
      }
    } else if (callStatus === "failed") {
      newStatus = "failed";
      outcome = "failed";
    }

    await db.update(discagemCallsTable).set({
      status: newStatus,
      outcome,
      durationSeconds: parseInt(duration, 10) || 0,
      recordingUrl: recordingUrl || call.recordingUrl,
      transcript: history.length > 0 ? JSON.stringify(history) : call.transcript,
      endedAt: new Date(),
    }).where(eq(discagemCallsTable.id, callId));

    // Atualiza contadores da campanha
    if (call.campaignId) {
      await updateCampaignCounters(call.campaignId);
    }
  } catch (err) {
    console.error("[discagem-status] Erro:", err);
  }
});

// ─────────────────────────────────────────────────────────────────
// WEBHOOK: AMD (Answering Machine Detection)
// ─────────────────────────────────────────────────────────────────
router.post("/discagem/amd/:callId", async (req, res): Promise<void> => {
  const callId = parseInt(Array.isArray(req.params.callId) ? req.params.callId[0] : req.params.callId, 10);
  const amdStatus: string = req.body?.AnsweredBy ?? "";

  res.sendStatus(204);

  if (amdStatus === "machine_start" || amdStatus === "machine_end_beep" || amdStatus === "machine_end_silence") {
    try {
      const [call] = await db.select({ twilioCallSid: discagemCallsTable.twilioCallSid, campaignId: discagemCallsTable.campaignId })
        .from(discagemCallsTable).where(eq(discagemCallsTable.id, callId));

      await db.update(discagemCallsTable).set({
        status: "voicemail",
        outcome: "voicemail",
        endedAt: new Date(),
      }).where(eq(discagemCallsTable.id, callId));

      markCallInactive(callId);
      conversationCache.delete(callId);

      if (call?.twilioCallSid) {
        await hangupCall(call.twilioCallSid);
      }
      if (call?.campaignId) await updateCampaignCounters(call.campaignId);
    } catch (err) {
      console.error("[discagem-amd] Erro:", err);
    }
  }
});

// ─────────────────────────────────────────────────────────────────
// SERVE ÁUDIO TTS
// ─────────────────────────────────────────────────────────────────
router.get("/discagem/audio/:id", (req, res): void => {
  const id = String(req.params.id).replace(/[^a-f0-9]/gi, "");
  const filePath = path.join(TMP_AUDIO_DIR, `${id}.mp3`);
  if (!existsSync(filePath)) { res.status(404).send("Not found"); return; }
  res.setHeader("Content-Type", "audio/mpeg");
  createReadStream(filePath).pipe(res);
});

// ─────────────────────────────────────────────────────────────────
// ADMIN — Campanhas
// ─────────────────────────────────────────────────────────────────
router.get("/admin/discagem/campaigns", requireAdmin, async (req, res): Promise<void> => {
  const campaigns = await db.select().from(discagemCampaignsTable).orderBy(desc(discagemCampaignsTable.createdAt));
  res.json(campaigns);
});

router.post("/admin/discagem/campaigns", requireAdmin, async (req, res): Promise<void> => {
  const {
    name, targetType, targetContactIds, manualNumber, filterDdd,
    aiModel, agentName, ttsProvider, ttsVoiceId,
    windowMorningStart, windowMorningEnd, windowAfternoonStart, windowAfternoonEnd,
    windowDays, maxConcurrentCalls, maxAttempts,
  } = req.body ?? {};

  if (!name) { res.status(400).json({ error: "Nome obrigatório" }); return; }

  // Normaliza DDDs: aceita "11,17" ou ["11","17"]
  const dddNorm = normalizeDdd(filterDdd);

  const [camp] = await db.insert(discagemCampaignsTable).values({
    name,
    status: "draft",
    targetType: targetType ?? "all",
    targetContactIds: targetContactIds ? JSON.stringify(targetContactIds) : null,
    manualNumber: manualNumber ?? null,
    filterDdd: dddNorm,
    aiModel: aiModel ?? "deepseek",
    ttsProvider: ttsProvider ?? "cartesia",
    ttsVoiceId: ttsVoiceId ?? null,
    windowMorningStart: windowMorningStart ?? 9,
    windowMorningEnd: windowMorningEnd ?? 12,
    windowAfternoonStart: windowAfternoonStart ?? 13,
    windowAfternoonEnd: windowAfternoonEnd ?? 16,
    windowDays: windowDays ? JSON.stringify(windowDays) : '["mon","tue","wed","thu"]',
    maxConcurrentCalls: maxConcurrentCalls ?? 3,
    maxAttempts: maxAttempts ?? 2,
  }).returning();

  res.status(201).json(camp);
});

router.put("/admin/discagem/campaigns/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const allowed = ["name", "aiModel", "agentName", "ttsProvider", "ttsVoiceId",
    "windowMorningStart", "windowMorningEnd", "windowAfternoonStart", "windowAfternoonEnd",
    "windowDays", "maxConcurrentCalls", "maxAttempts", "targetType",
    "targetContactIds", "manualNumber", "filterDdd"];

  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in req.body) updates[k] = req.body[k];
  }
  if (updates.targetContactIds) updates.targetContactIds = JSON.stringify(updates.targetContactIds);
  if (updates.windowDays) updates.windowDays = JSON.stringify(updates.windowDays);
  if ("filterDdd" in updates) updates.filterDdd = normalizeDdd(updates.filterDdd as string | string[] | null);

  const [camp] = await db.update(discagemCampaignsTable).set(updates as any).where(eq(discagemCampaignsTable.id, id)).returning();
  if (!camp) { res.status(404).json({ error: "Campanha não encontrada" }); return; }
  res.json(camp);
});

router.delete("/admin/discagem/campaigns/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(discagemCampaignsTable).where(eq(discagemCampaignsTable.id, id));
  res.json({ ok: true });
});

// ─── Iniciar campanha ─────────────────────────────────────────────
router.post("/admin/discagem/campaigns/:id/start", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [camp] = await db.select().from(discagemCampaignsTable).where(eq(discagemCampaignsTable.id, id));
  if (!camp) { res.status(404).json({ error: "Campanha não encontrada" }); return; }

  // Popula calls (idempotente — se já tiver, não recria)
  const count = await populateCampaignCalls(camp);

  await db.update(discagemCampaignsTable).set({
    status: "running",
    pauseReason: null,
    pausedApi: null,
    startedAt: camp.startedAt ?? new Date(),
  }).where(eq(discagemCampaignsTable.id, id));

  startScheduler();
  res.json({ ok: true, queued: count });
});

// ─── Pausar campanha ──────────────────────────────────────────────
router.post("/admin/discagem/campaigns/:id/pause", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.update(discagemCampaignsTable).set({
    status: "paused",
    pauseReason: "Pausado manualmente pelo administrador",
    pausedApi: null,
  }).where(eq(discagemCampaignsTable.id, id));
  res.json({ ok: true });
});

// ─── Retomar campanha ─────────────────────────────────────────────
router.post("/admin/discagem/campaigns/:id/resume", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.update(discagemCampaignsTable).set({
    status: "running",
    pauseReason: null,
    pausedApi: null,
  }).where(eq(discagemCampaignsTable.id, id));
  startScheduler();
  res.json({ ok: true });
});

// ─── Status em tempo real ─────────────────────────────────────────
router.get("/admin/discagem/campaigns/:id/status", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [camp] = await db.select().from(discagemCampaignsTable).where(eq(discagemCampaignsTable.id, id));
  if (!camp) { res.status(404).json({ error: "Campanha não encontrada" }); return; }

  // Chamadas ativas agora
  const activeCalls = await db
    .select({
      id: discagemCallsTable.id,
      phone: discagemCallsTable.phoneNumber,
      name: discagemCallsTable.contactName,
      status: discagemCallsTable.status,
      startedAt: discagemCallsTable.startedAt,
    })
    .from(discagemCallsTable)
    .where(and(
      eq(discagemCallsTable.campaignId, id),
      inArray(discagemCallsTable.status, ["dialing", "in_progress"]),
    ));

  // Totais
  const totals = await db
    .select({
      status: discagemCallsTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(discagemCallsTable)
    .where(eq(discagemCallsTable.campaignId, id))
    .groupBy(discagemCallsTable.status);

  const totalMap: Record<string, number> = {};
  for (const t of totals) totalMap[t.status] = t.count;

  const totalDone = (totalMap.answered ?? 0) + (totalMap.no_answer ?? 0) + (totalMap.voicemail ?? 0) + (totalMap.failed ?? 0) + (totalMap.optout ?? 0);
  const totalQueued = totalMap.queued ?? 0;
  const answerRate = totalDone > 0 ? Math.round(((totalMap.answered ?? 0) / totalDone) * 100) : 0;

  res.json({
    campaign: camp,
    activeCalls,
    totalQueued,
    totalAnswered: totalMap.answered ?? 0,
    totalNoAnswer: totalMap.no_answer ?? 0,
    totalVoicemail: totalMap.voicemail ?? 0,
    totalFailed: totalMap.failed ?? 0,
    totalOptout: totalMap.optout ?? 0,
    totalDone,
    answerRate,
  });
});

// ─── Lista chamadas da campanha ───────────────────────────────────
router.get("/admin/discagem/campaigns/:id/calls", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const status = req.query.status as string | undefined;

  let query = db.select().from(discagemCallsTable).where(eq(discagemCallsTable.campaignId, id)).$dynamic();
  if (status && status !== "all") {
    query = query.where(eq(discagemCallsTable.status, status));
  }
  const calls = await query.orderBy(desc(discagemCallsTable.createdAt)).limit(500);
  res.json(calls);
});

// ─── Lista contatos disponíveis ───────────────────────────────────
router.get("/admin/discagem/contacts", requireAdmin, async (req, res): Promise<void> => {
  const type = req.query.type as string | undefined;
  let query = db
    .select({ id: marketingContactsTable.id, name: marketingContactsTable.name, phone: marketingContactsTable.phone, type: marketingContactsTable.type })
    .from(marketingContactsTable)
    .where(eq(marketingContactsTable.status, "active"))
    .$dynamic();

  if (type && type !== "all") {
    query = query.where(eq(marketingContactsTable.type, type));
  }

  const contacts = await query.orderBy(marketingContactsTable.name).limit(1000);
  res.json(contacts);
});

// ─── Teste: discar um número agora ───────────────────────────────
router.post("/admin/discagem/test-call", requireAdmin, async (req, res): Promise<void> => {
  const { phoneNumber, aiModel, agentName, ttsProvider, ttsVoiceId } = req.body ?? {};
  if (!phoneNumber) { res.status(400).json({ error: "phoneNumber obrigatório" }); return; }

  // Cria campanha temporária de teste
  const [camp] = await db.insert(discagemCampaignsTable).values({
    name: `Teste ${new Date().toISOString()}`,
    status: "running",
    targetType: "manual_number",
    manualNumber: phoneNumber,
    aiModel: aiModel ?? "deepseek",
    agentName: agentName ?? "Willian",
    ttsProvider: ttsProvider ?? "cartesia",
    ttsVoiceId: ttsVoiceId ?? null,
    maxConcurrentCalls: 1,
    maxAttempts: 1,
  }).returning();

  const [call] = await db.insert(discagemCallsTable).values({
    campaignId: camp.id,
    phoneNumber,
    contactName: "Teste manual",
    status: "queued",
    attemptNumber: 1,
  }).returning();

  try {
    const twilioSid = await initiateCall({
      to: phoneNumber,
      callbackBaseUrl: `${process.env.PUBLIC_HOSTNAME}/api/discagem`,
      callId: call.id,
      campaignId: camp.id,
    });
    await db.update(discagemCallsTable).set({ twilioCallSid: twilioSid, status: "dialing" }).where(eq(discagemCallsTable.id, call.id));
    res.json({ ok: true, callId: call.id, twilioSid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(discagemCallsTable).set({ status: "failed", error: msg }).where(eq(discagemCallsTable.id, call.id));
    res.status(500).json({ error: msg });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────
async function updateCampaignCounters(campaignId: number): Promise<void> {
  const totals = await db
    .select({ status: discagemCallsTable.status, count: sql<number>`count(*)::int` })
    .from(discagemCallsTable)
    .where(eq(discagemCallsTable.campaignId, campaignId))
    .groupBy(discagemCallsTable.status);

  const m: Record<string, number> = {};
  for (const t of totals) m[t.status] = t.count;

  await db.update(discagemCampaignsTable).set({
    totalCalled: (m.answered ?? 0) + (m.no_answer ?? 0) + (m.voicemail ?? 0) + (m.failed ?? 0) + (m.optout ?? 0),
    totalAnswered: m.answered ?? 0,
    totalVoicemail: m.voicemail ?? 0,
    totalOptout: m.optout ?? 0,
    totalNoAnswer: m.no_answer ?? 0,
    totalFailed: m.failed ?? 0,
  }).where(eq(discagemCampaignsTable.id, campaignId));
}

function getNextBusinessDay(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  // Pula fim de semana
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export default router;
