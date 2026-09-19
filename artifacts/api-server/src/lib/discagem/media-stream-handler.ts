/**
 * Twilio Media Streams + Deepgram — streaming STT bidirecional em tempo real.
 *
 * Arquitetura persistente (v2):
 * 1. Stream abre com track="both_tracks" e FICA ABERTO durante toda a call
 * 2. Áudio do agente é enviado como frames mulaw via WebSocket outbound
 *    → permite barge-in real: ao detectar fala do usuário, envia `clear` e para
 * 3. Deepgram roda continuamente com interim_results=true para detectar fala
 *    o mais cedo possível
 * 4. Sem redirecionamentos entre turnos — elimina o eco e os sons de "amham"
 */

import { WebSocket, WebSocketServer } from "ws";
import type { Server, IncomingMessage } from "http";
import path from "node:path";
import { db } from "@workspace/db";
import {
  discagemCallsTable,
  discagemCampaignsTable,
  marketingContactsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { getDiscagemSettings } from "./settings-reader";
import {
  pendingResults, streamModeCalls,
  getConvHistory, processSpeechTurn,
  type PendingPayload,
} from "./conversation-state";
import { getFillerMulawBuffer } from "./filler-audio";
import { mp3FileToMulaw, TMP_AUDIO_DIR } from "./tts";
import { pauseCampaignForCredit } from "./scheduler";
import { hangupCall } from "./twilio-client";

// ── Envia frames mulaw via WebSocket outbound (Twilio track="both_tracks") ──
function sendMulawOutbound(ws: WebSocket, streamSid: string, buffer: Buffer): void {
  // Envia em blocos de 3200 bytes ≈ 400ms — evita saturar o buffer do WS
  const CHUNK = 3200;
  for (let i = 0; i < buffer.length; i += CHUNK) {
    if (ws.readyState !== WebSocket.OPEN) break;
    ws.send(JSON.stringify({
      event: "media",
      streamSid,
      media: {
        track: "outbound",
        payload: buffer.slice(i, Math.min(i + CHUNK, buffer.length)).toString("base64"),
      },
    }));
  }
}

// ── Para o áudio outbound imediatamente ──────────────────────────
function clearOutbound(ws: WebSocket, streamSid: string): void {
  if (ws.readyState === WebSocket.OPEN && streamSid) {
    ws.send(JSON.stringify({ event: "clear", streamSid }));
  }
}

// ── Configura o servidor WebSocket de Media Streams ───────────────
export function setupMediaStreamWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = req.url ?? "";
    if (!url.startsWith("/api/discagem/media-stream/")) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket as any, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const url = req.url ?? "";
    const match = url.match(/\/api\/discagem\/media-stream\/(\d+)/);
    if (!match) { ws.close(); return; }

    const callId = parseInt(match[1], 10);
    if (isNaN(callId)) { ws.close(); return; }

    let streamSid = "";
    let twilioCallSid = "";
    let deepgramWs: WebSocket | null = null;

    // ── Estado de controle por turno ──────────────────────────────
    let isProcessing = false;    // IA+TTS rodando
    let isTtsPlaying = false;    // enviando áudio outbound agora
    let bargeInResolve: (() => void) | null = null; // resolve quando user interrompe
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let emptyTranscriptCount = 0;
    let gracePeriod = true;      // 3s após stream abrir — ignora eco do TTS anterior

    const cfg = await getDiscagemSettings().catch(() => null);
    if (!cfg?.deepgramApiKey) {
      console.warn(`[media-stream] callId=${callId} Deepgram API key ausente`);
      ws.close();
      return;
    }

    const { twilioAccountSid, twilioAuthToken } = cfg;

    // ── Carrega call e campanha uma vez ───────────────────────────
    const [callRow] = await db.select().from(discagemCallsTable).where(eq(discagemCallsTable.id, callId));
    const [campaignRow] = callRow?.campaignId
      ? await db.select().from(discagemCampaignsTable).where(eq(discagemCampaignsTable.id, callRow.campaignId))
      : [null];

    if (!callRow || !campaignRow) {
      console.warn(`[media-stream] callId=${callId} call/campaign não encontrado`);
      ws.close();
      return;
    }

    // ── Deepgram com interim_results para barge-in precoce ────────
    const dgUrl = "wss://api.deepgram.com/v1/listen?" + new URLSearchParams({
      encoding:        "mulaw",
      sample_rate:     "8000",
      model:           "nova-2",
      language:        "pt-BR",
      punctuate:       "true",
      endpointing:     "400",          // 400ms silêncio = fim de fala
      interim_results: "true",         // detecção precoce para barge-in
    }).toString();

    deepgramWs = new WebSocket(dgUrl, {
      headers: { Authorization: `Token ${cfg.deepgramApiKey}` },
    });

    // ── Hangup via REST API Twilio ────────────────────────────────
    async function hangupViaRest(): Promise<void> {
      const sid = twilioCallSid || callRow.twilioCallSid;
      if (sid) {
        await hangupCall(sid).catch(e =>
          console.warn(`[media-stream] hangup falhou callId=${callId}:`, e.message),
        );
      }
    }

    // ── Salva status final da call ────────────────────────────────
    async function saveCallEnd(result: PendingPayload): Promise<void> {
      const allEmails = result.history
        .filter(t => t.role === "assistant")
        .map(t => { const m = t.text.match(/\[REGISTRAR_EMAIL:([^\]]+)\]/i); return m ? m[1].trim() : null; })
        .filter(Boolean);
      const capturedEmail = result.capturedEmail ?? allEmails.at(-1) ?? null;

      const outcome = result.isOptOut        ? "optout"
                    : result.transferToHuman ? "transferred"
                    : result.callbackRequested ? "callback_requested"
                    : "answered";

      await db.update(discagemCallsTable).set({
        status: result.isOptOut ? "optout" : "answered",
        outcome,
        transcript: result.history.length > 0 ? JSON.stringify(result.history) : undefined,
        systemPromptUsed: result.promptUsed,
        aiSource: result.aiSource,
        ...(capturedEmail ? { contactEmail: capturedEmail, wantsFollowupEmail: true } : {}),
      }).where(eq(discagemCallsTable.id, callId)).catch(() => {});

      if (result.isOptOut && callRow.contactId) {
        await db.update(marketingContactsTable)
          .set({ status: "optout" })
          .where(eq(marketingContactsTable.id, callRow.contactId))
          .catch(() => {});
      }
    }

    // ── Toca áudio mulaw via outbound + aguarda conclusão ou barge-in ─
    async function playMulaw(buffer: Buffer, label: string): Promise<"done" | "bargedIn"> {
      if (!streamSid || ws.readyState !== WebSocket.OPEN) return "done";
      isTtsPlaying = true;
      sendMulawOutbound(ws, streamSid, buffer);

      // Duração aproximada + 400ms de buffer para Twilio esvaziar a fila
      const durationMs = Math.ceil((buffer.length / 8000) * 1000) + 400;

      return new Promise<"done" | "bargedIn">((resolve) => {
        const timer = setTimeout(() => {
          bargeInResolve = null;
          isTtsPlaying = false;
          resolve("done");
        }, durationMs);

        bargeInResolve = () => {
          clearTimeout(timer);
          bargeInResolve = null;
          isTtsPlaying = false;
          resolve("bargedIn");
        };
      });
    }

    // ── Processamento completo de um turno (user speech → IA → TTS) ─
    async function processTurn(transcript: string): Promise<void> {
      if (isProcessing) return;
      isProcessing = true;

      console.info(`[media-stream] Turno callId=${callId}: "${transcript}"`);

      // Dispara pipeline IA+TTS em background
      processSpeechTurn(callId, campaignRow as any, transcript);

      // Aguarda resultado (Promise armazenada em pendingResults)
      const pending = pendingResults.get(callId);
      if (!pending) {
        console.warn(`[media-stream] pendingResults vazio callId=${callId} — ignorando turno`);
        isProcessing = false;
        return;
      }

      // Toca filler enquanto IA processa (sem bloquear o await abaixo)
      const fillerProm = getFillerMulawBuffer("thinking").then(async (filler) => {
        if (filler && streamSid && ws.readyState === WebSocket.OPEN && isTtsPlaying === false) {
          await playMulaw(filler, "filler");
        }
      }).catch(() => {});

      const result = await pending.promise;
      pendingResults.delete(callId);

      // Para o filler imediatamente (se ainda tocando)
      clearOutbound(ws, streamSid);
      isTtsPlaying = false;
      if (bargeInResolve) { bargeInResolve(); }

      // Aguarda resolução do fillerProm para evitar race
      await fillerProm.catch(() => {});

      // Salva transcript parcial a cada turno
      if (result.history.length > 0) {
        await db.update(discagemCallsTable).set({
          transcript: JSON.stringify(result.history),
          systemPromptUsed: result.promptUsed,
          aiSource: result.aiSource,
        }).where(eq(discagemCallsTable.id, callId)).catch(() => {});
      }

      // Trata erro de crédito
      if (result.err) {
        const creditApi = (result.err as any)?.creditError as string | undefined;
        if (creditApi && callRow.campaignId) {
          await pauseCampaignForCredit(callRow.campaignId, creditApi, (result.err as Error).message);
        }
        await hangupViaRest();
        deepgramWs?.close();
        return;
      }

      // Toca a resposta da IA via outbound mulaw
      if (result.audioUrl && ws.readyState === WebSocket.OPEN) {
        const audioId = result.audioUrl.split("/").at(-1)!;
        const mp3Path = path.join(TMP_AUDIO_DIR, `${audioId}.mp3`);
        try {
          const mulawBuf = await mp3FileToMulaw(mp3Path);

          // Adiciona período de graça após TTS para evitar que eco dispare próximo turno
          gracePeriod = true;
          const outcome = await playMulaw(mulawBuf, "response");
          // Grace period de 1.5s após áudio para absorver eco da linha telefônica
          setTimeout(() => { gracePeriod = false; }, 1500);

          if (outcome === "bargedIn") {
            console.info(`[media-stream] Barge-in callId=${callId} — usuário interrompeu`);
          }
        } catch (err) {
          console.error(`[media-stream] Erro ao converter/enviar TTS callId=${callId}:`, err);
          gracePeriod = false;
        }
      }

      // Encerra a call se IA decidiu
      if (result.shouldEndCall) {
        await saveCallEnd(result);
        await hangupViaRest();
        deepgramWs?.close();
        return;
      }

      // Pronto para o próximo turno
      isProcessing = false;
      resetSilenceTimer();
    }

    // ── Timer de silêncio — só ativa fora do período de graça ─────
    function resetSilenceTimer(): void {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        if (!isProcessing && !isTtsPlaying && !gracePeriod) {
          processTurn("[SEM_VOZ]").catch(() => {});
        }
      }, 20_000);
    }

    // ── Evento de silêncio/vazio detectado pelo Deepgram ─────────
    async function handleSilenceOrEmpty(): Promise<void> {
      if (isProcessing || isTtsPlaying || gracePeriod) return;
      await processTurn("[SEM_VOZ]");
    }

    // ── Handler de mensagens do Deepgram ──────────────────────────
    deepgramWs.on("open", () => {
      console.info(`[media-stream] Deepgram conectado callId=${callId}`);
      // Período de graça de 3s após conectar para absorver eco do áudio de abertura
      gracePeriod = true;
      setTimeout(() => {
        gracePeriod = false;
        resetSilenceTimer();
      }, 3000);
    });

    deepgramWs.on("message", async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type !== "Results") return;

        const transcript: string = (msg.channel?.alternatives?.[0]?.transcript ?? "").trim();
        const isSpeechFinal = msg.speech_final === true;
        const isInterim = msg.is_final === false; // resultado parcial (interim)

        // ── Barge-in: user falou enquanto agente tocava áudio ────
        if (transcript && isTtsPlaying && (isInterim || isSpeechFinal)) {
          console.info(`[media-stream] Barge-in detectado callId=${callId}: "${transcript}"`);
          clearOutbound(ws, streamSid);
          isTtsPlaying = false;
          if (bargeInResolve) { bargeInResolve(); bargeInResolve = null; }
        }

        // Ignora interims sem barge-in (só speech_final processa o turno)
        if (!isSpeechFinal) return;

        // Ignora eventos durante período de graça (eco do TTS)
        if (gracePeriod) {
          console.info(`[media-stream] Ignorado (grace period) callId=${callId}: "${transcript}"`);
          return;
        }

        if (!transcript) {
          emptyTranscriptCount++;
          console.info(`[media-stream] Transcript vazio callId=${callId} (${emptyTranscriptCount}x)`);
          if (emptyTranscriptCount >= 4) {
            emptyTranscriptCount = 0;
            await handleSilenceOrEmpty();
          } else {
            resetSilenceTimer();
          }
          return;
        }

        // Transcript válido — processa o turno
        emptyTranscriptCount = 0;
        if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }

        processTurn(transcript).catch(err =>
          console.error(`[media-stream] Erro no processTurn callId=${callId}:`, err),
        );
      } catch (err) {
        console.error(`[media-stream] Erro ao processar mensagem Deepgram callId=${callId}:`, err);
      }
    });

    deepgramWs.on("error", async (err) => {
      console.error(`[media-stream] Deepgram error callId=${callId}: ${err.message}`);
    });

    deepgramWs.on("close", (code) => {
      console.info(`[media-stream] Deepgram desconectado callId=${callId} code=${code}`);
    });

    // ── Processa mensagens do Twilio ───────────────────────────────
    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.event) {
          case "start":
            streamSid = msg.streamSid ?? "";
            twilioCallSid = msg.start?.callSid ?? "";
            console.info(
              `[media-stream] Stream iniciado callId=${callId} streamSid=${streamSid} callSid=${twilioCallSid}`,
            );
            break;

          case "media":
            // Apenas áudio inbound (user → Deepgram) — outbound não vai pro Deepgram
            if (msg.media?.track === "outbound") break;
            if (deepgramWs?.readyState === WebSocket.OPEN) {
              const chunk = Buffer.from(msg.media.payload, "base64");
              deepgramWs.send(chunk);
            }
            break;

          case "stop":
            console.info(`[media-stream] Stream parado callId=${callId}`);
            if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
            deepgramWs?.close();
            break;
        }
      } catch {
        // Mensagem não-JSON — ignora
      }
    });

    ws.on("close", () => {
      deepgramWs?.close();
      streamModeCalls.delete(callId);
      if (silenceTimer) clearTimeout(silenceTimer);
      console.info(`[media-stream] WebSocket fechado callId=${callId}`);
    });

    ws.on("error", (err) => {
      console.error(`[media-stream] WebSocket error callId=${callId}:`, err.message);
      deepgramWs?.close();
    });
  });

  console.info("[media-stream] WebSocket server configurado (Media Streams + Deepgram bidirecional)");
}
