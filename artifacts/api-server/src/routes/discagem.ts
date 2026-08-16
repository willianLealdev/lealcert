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
import { db, pool } from "@workspace/db";
import {
  discagemCampaignsTable,
  discagemCallsTable,
  marketingContactsTable,
} from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { runAgentTurn, detectCreditError } from "../lib/discagem/ai-agent";
import { synthesize, audioUrl, TMP_AUDIO_DIR } from "../lib/discagem/tts";
import { resolveVoiceId, consumePreGeneratedOpening, preGenerateOpening } from "../lib/discagem/opening-pregenerate";
import { invalidateDiscagemSettingsCache, getDiscagemSettings } from "../lib/discagem/settings-reader";
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

// resolveVoiceId e preGenerateOpening vivem em opening-pregenerate.ts

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
  transferToHuman?: boolean;
  callbackRequested?: boolean;
  capturedEmail?: string | null;
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

    // Atualiza status (startedAt como fallback caso não tenha sido setado em dialing)
    await db.update(discagemCallsTable)
      .set({ status: "in_progress", startedAt: sql`COALESCE(started_at, NOW())` })
      .where(eq(discagemCallsTable.id, callId));

    // Usa áudio pré-gerado (sem silêncio) ou gera on-demand como fallback
    const preGen = consumePreGeneratedOpening(callId);
    let url: string;
    let agentText: string;

    if (preGen) {
      url = preGen.audioUrl;
      agentText = preGen.agentText;
      console.info(`[discagem-voice] Usando opening pré-gerado callId=${callId}`);
    } else {
      console.info(`[discagem-voice] Gerando opening on-demand callId=${callId}`);
      const openingHistory = [{ role: "user" as const, text: "[INÍCIO DA LIGAÇÃO]", ts: new Date().toISOString() }];
      const aiResp = await runAgentTurn(openingHistory, campaign.aiModel as any, (campaign as any).agentName ?? "Willian", undefined);
      agentText = aiResp.text;
      const resolvedVoiceId = await resolveVoiceId(campaign.ttsVoiceId, (campaign as any).agentName ?? "Willian", campaign.ttsProvider as any);
      const { id: ttsId } = await synthesize(agentText, campaign.ttsProvider as any, resolvedVoiceId);
      url = await audioUrl(ttsId);
    }

    getConvHistory(callId).push({ role: "assistant", text: agentText, ts: new Date().toISOString() });

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
    const resolvedVoiceId2 = await resolveVoiceId(campaign.ttsVoiceId, (campaign as any).agentName ?? "Willian", campaign.ttsProvider as any);
    const { id: ttsId } = await synthesize(aiResp.text, campaign.ttsProvider as any, resolvedVoiceId2);
    const url = await audioUrl(ttsId);
    return { audioUrl: url, shouldEndCall: aiResp.shouldEndCall, isOptOut: aiResp.isOptOut, transferToHuman: aiResp.transferToHuman, callbackRequested: aiResp.callbackRequested, capturedEmail: aiResp.capturedEmail, history };
  })().catch(err => ({ audioUrl: "", shouldEndCall: true, isOptOut: false, transferToHuman: false, callbackRequested: false, capturedEmail: null, history, err }));

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
    // Acumula e-mails capturados ao longo da conversa (pode ter sido detectado em qualquer turno)
    const allEmails = payload.history
      .filter(t => t.role === "assistant")
      .map(t => { const m = t.text.match(/\[REGISTRAR_EMAIL:([^\]]+)\]/i); return m ? m[1].trim() : null; })
      .filter(Boolean);
    const capturedEmail = payload.capturedEmail ?? allEmails.at(-1) ?? null;

    const outcome = payload.isOptOut          ? "optout"
                  : payload.transferToHuman   ? "transferred"
                  : payload.callbackRequested ? "callback_requested"
                  : "answered";

    await db.update(discagemCallsTable).set({
      transcript: JSON.stringify(payload.history),
      status: payload.isOptOut ? "optout" : "answered",
      outcome,
      ...(capturedEmail ? { contactEmail: capturedEmail, wantsFollowupEmail: true } : {}),
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

// ─── Relatório por contato ────────────────────────────────────────
// GET /admin/discagem/report?period=today|week|month|all
router.get("/admin/discagem/report", requireAdmin, async (req, res): Promise<void> => {
  const period = (req.query.period as string) ?? "all";

  // Calcula data de corte no fuso de Brasília
  let since: Date | null = null;
  if (period === "today") {
    const now = new Date();
    const brStr = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
    const [m, d, y] = brStr.split("/");
    // Meia-noite de hoje em Brasília = UTC−3
    since = new Date(`${y}-${m}-${d}T03:00:00.000Z`);
    if (since > now) since = new Date(since.getTime() - 86400000); // dia anterior se passou da meia-noite UTC
  } else if (period === "week") {
    since = new Date(Date.now() - 7 * 86400000);
  } else if (period === "month") {
    since = new Date(Date.now() - 30 * 86400000);
  }

  const params: unknown[] = [];
  const whereClause = since ? (params.push(since), "WHERE dc.created_at >= $1") : "";

  const { rows } = await pool.query<{
    phoneNumber: string;
    contactName: string | null;
    totalAttempts: number;
    answered: boolean;
    lastCallAt: string;
    lastStatus: string;
    totalDuration: number;
    campaignNames: string;
  }>(`
    SELECT
      dc.phone_number        AS "phoneNumber",
      dc.contact_name        AS "contactName",
      COUNT(*)::int          AS "totalAttempts",
      BOOL_OR(dc.status = 'answered') AS "answered",
      MAX(dc.created_at)     AS "lastCallAt",
      (SELECT dc2.status FROM discagem_calls dc2
       WHERE dc2.phone_number = dc.phone_number
       ORDER BY dc2.created_at DESC LIMIT 1) AS "lastStatus",
      SUM(COALESCE(dc.duration_seconds, 0))::int AS "totalDuration",
      STRING_AGG(DISTINCT dcamp.name, ', ') AS "campaignNames"
    FROM discagem_calls dc
    LEFT JOIN discagem_campaigns dcamp ON dcamp.id = dc.campaign_id
    ${whereClause}
    GROUP BY dc.phone_number, dc.contact_name
    ORDER BY MAX(dc.created_at) DESC
    LIMIT 500
  `, params);

  res.json(rows);
});

// ─── Enviar e-mail de follow-up para contato da ligação ──────────
router.post("/admin/discagem/calls/:id/send-email", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [call] = await db.select().from(discagemCallsTable).where(eq(discagemCallsTable.id, id));
  if (!call) { res.status(404).json({ error: "Ligação não encontrada" }); return; }
  if (!call.contactEmail) { res.status(400).json({ error: "Nenhum e-mail registrado para essa ligação" }); return; }

  // Busca configurações SMTP
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM ?? smtpUser ?? "noreply@lealcert.com.br";

  if (!smtpHost || !smtpUser || !smtpPass) {
    res.status(500).json({ error: "SMTP não configurado — verifique as variáveis de ambiente SMTP_*" });
    return;
  }

  const contactName = call.contactName ?? "Contador";
  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <img src="https://lealcert.com.br/logo.png" alt="LealCert" style="height:48px;margin-bottom:24px" onerror="this.style.display='none'" />
  <h2 style="color:#1a2e4a">Olá, ${contactName}!</h2>
  <p>Conforme conversamos por telefone, segue o material sobre a parceria LealCert para escritórios de contabilidade.</p>
  <h3 style="color:#2563eb">Por que ser parceiro LealCert?</h3>
  <ul>
    <li><strong>Custo para o parceiro:</strong> R$ 90,00 por certificado</li>
    <li><strong>Margem livre:</strong> você define o preço ao cliente final</li>
    <li><strong>Exemplo:</strong> e-CNPJ A1 → venda a R$ 274,00 = margem bruta de R$ 184,00</li>
    <li><strong>Bônus de fidelidade:</strong> a cada 10 certificados, 1 de cortesia</li>
    <li><strong>Cupom no 1º certificado:</strong> PARCEIRO (R$ 70,00 no lugar de R$ 90,00)</li>
    <li><strong>Processo 100% online</strong> com videoconferência — sem deslocamento</li>
  </ul>
  <h3 style="color:#2563eb">Como começar</h3>
  <p>
    Acesse <a href="https://lealcert.com.br/contadores" style="color:#2563eb">lealcert.com.br/contadores</a>,
    clique em <strong>Cadastre-se</strong> e informe seu CRC para validação.
  </p>
  <p style="margin-top:24px">
    Dúvidas? Fale diretamente pelo WhatsApp: <strong>(17) 3176-0105</strong>
  </p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
  <p style="font-size:12px;color:#6b7280">
    LealCert Certificados Digitais · lealcert.com.br<br/>
    Você recebeu este e-mail pois demonstrou interesse durante contato telefônico.
  </p>
</div>`;

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"LealCert Certificados Digitais" <${smtpFrom}>`,
      to: call.contactEmail,
      subject: "Material sobre Parceria LealCert — Certificados Digitais",
      html,
    });

    await db.update(discagemCallsTable)
      .set({ followupEmailSentAt: new Date() })
      .where(eq(discagemCallsTable.id, id));

    res.json({ ok: true, sentTo: call.contactEmail });
  } catch (err) {
    console.error("[discagem] Erro ao enviar e-mail:", err);
    res.status(500).json({ error: "Falha ao enviar e-mail: " + (err instanceof Error ? err.message : String(err)) });
  }
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
/** Normaliza número para E.164. Se não tiver +, assume Brasil (+55). */
function normalizePhoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return `+${digits}`;
  // Número americano: 10 dígitos sem código de país → +1
  if (digits.length === 10 && digits.startsWith("1") === false) return `+1${digits}`;
  // Número brasileiro: 10-11 dígitos → +55
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  // Já tem DDI embutido (12-13 dígitos com 55 na frente)
  if (digits.length >= 12) return `+${digits}`;
  return `+55${digits}`;
}

router.post("/admin/discagem/test-call", requireAdmin, async (req, res): Promise<void> => {
  const { phoneNumber: rawPhone, aiModel, agentName, ttsProvider, ttsVoiceId } = req.body ?? {};
  if (!rawPhone) { res.status(400).json({ error: "phoneNumber obrigatório" }); return; }
  const phoneNumber = normalizePhoneE164(String(rawPhone));

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
    const { publicHostname } = await getDiscagemSettings();
    // Pré-gera áudio de abertura antes de ligar (elimina silêncio quando a pessoa atender)
    await preGenerateOpening(call.id, camp);
    const twilioSid = await initiateCall({
      to: phoneNumber,
      callbackBaseUrl: `${publicHostname || process.env.PUBLIC_HOSTNAME || ""}/api/discagem`,
      callId: call.id,
      campaignId: camp.id,
    });
    await db.update(discagemCallsTable).set({ twilioCallSid: twilioSid, status: "dialing", startedAt: new Date() }).where(eq(discagemCallsTable.id, call.id));
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
