/**
 * Twilio Media Streams + Deepgram — streaming STT em tempo real.
 *
 * Fluxo por turno:
 * 1. Twilio envia áudio raw (mulaw 8kHz) via WebSocket
 * 2. Forwarda para Deepgram streaming
 * 3. Deepgram detecta fim de fala (endpointing ~500ms de silêncio)
 * 4. Dispara pipeline IA+TTS em background (via processSpeechTurn)
 * 5. Redireciona a call Twilio para /reply (que já tem filler retry logic)
 * 6. /reply toca o áudio e reconecta o stream para o próximo turno
 */

import { WebSocket, WebSocketServer } from "ws";
import type { Server, IncomingMessage } from "http";
import { db } from "@workspace/db";
import { discagemCallsTable, discagemCampaignsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getDiscagemSettings } from "./settings-reader";
import { processSpeechTurn, streamModeCalls } from "./conversation-state";

// ── Redireciona a call Twilio para uma nova URL TwiML ─────────────
async function redirectTwilioCall(twilioSid: string, twimlUrl: string): Promise<void> {
  const { twilioAccountSid, twilioAuthToken } = await getDiscagemSettings();
  if (!twilioAccountSid || !twilioAuthToken) return;
  const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64");
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls/${twilioSid}.json`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ Url: twimlUrl, Method: "POST" }).toString(),
    },
  );
  if (!resp.ok) {
    const txt = await resp.text();
    console.warn(`[media-stream] redirectTwilioCall falhou (${resp.status}): ${txt}`);
  }
}

// ── Configura o servidor WebSocket de Media Streams ───────────────
export function setupMediaStreamWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  // Intercepta upgrade HTTP → WebSocket apenas no path correto
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

    let twilioCallSid = "";
    let deepgramWs: WebSocket | null = null;
    let isProcessing = false; // impede double-trigger por turno

    // ── Conecta ao Deepgram streaming ──────────────────────────────
    const cfg = await getDiscagemSettings().catch(() => null);
    if (!cfg?.deepgramApiKey) {
      console.warn(`[media-stream] callId=${callId} Deepgram API key ausente — fechando stream`);
      ws.close();
      return;
    }

    const dgUrl = "wss://api.deepgram.com/v1/listen?" + new URLSearchParams({
      encoding:         "mulaw",
      sample_rate:      "8000",
      language:         "pt-BR",
      punctuate:        "true",
      endpointing:      "500",   // 500ms de silêncio = fim de fala
      interim_results:  "false",
      utterance_end_ms: "1000",
    }).toString();

    deepgramWs = new WebSocket(dgUrl, {
      headers: { Authorization: `Token ${cfg.deepgramApiKey}` },
    });

    deepgramWs.on("open", () => {
      console.info(`[media-stream] Deepgram conectado callId=${callId}`);
    });

    deepgramWs.on("message", async (data: Buffer) => {
      if (isProcessing) return;
      try {
        const msg = JSON.parse(data.toString());

        // Aceita tanto speech_final quanto UtteranceEnd como sinal de fim de fala
        const isSpeechFinal = msg.type === "Results" && msg.speech_final === true;
        const isUtteranceEnd = msg.type === "UtteranceEnd";
        if (!isSpeechFinal && !isUtteranceEnd) return;

        const transcript: string = (
          msg.channel?.alternatives?.[0]?.transcript ?? ""
        ).trim();

        if (!transcript) return; // fala vazia (ruído)
        isProcessing = true;

        console.info(`[media-stream] Transcript callId=${callId}: "${transcript}"`);

        // Busca call e campanha
        const [call] = await db
          .select()
          .from(discagemCallsTable)
          .where(eq(discagemCallsTable.id, callId));
        if (!call) return;

        const [campaign] = await db
          .select()
          .from(discagemCampaignsTable)
          .where(eq(discagemCampaignsTable.id, call.campaignId!));
        if (!campaign) return;

        // Dispara IA+TTS em background
        processSpeechTurn(callId, campaign as any, transcript);

        // Redireciona a call Twilio → /reply (que já tem filler retry logic)
        const { publicHostname } = cfg;
        const base = publicHostname || process.env.PUBLIC_HOSTNAME || "";
        const replyUrl = `${base}/api/discagem/voice/${callId}/reply?attempt=1`;

        const sid = twilioCallSid || call.twilioCallSid;
        if (sid) {
          await redirectTwilioCall(sid, replyUrl);
        }

        // Deepgram vai fechar junto com a stream (o redirect encerra a stream)
        deepgramWs?.close();
      } catch (err) {
        console.error(`[media-stream] Erro ao processar transcript callId=${callId}:`, err);
      }
    });

    deepgramWs.on("error", (err) => {
      console.error(`[media-stream] Deepgram error callId=${callId}:`, err.message);
    });

    deepgramWs.on("close", () => {
      console.info(`[media-stream] Deepgram desconectado callId=${callId}`);
    });

    // ── Processa mensagens do Twilio ───────────────────────────────
    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.event) {
          case "start":
            twilioCallSid = msg.start?.callSid ?? "";
            console.info(
              `[media-stream] Stream iniciado callId=${callId} streamSid=${msg.streamSid} callSid=${twilioCallSid}`,
            );
            break;

          case "media":
            // Forward do chunk de áudio mulaw para o Deepgram
            if (deepgramWs?.readyState === WebSocket.OPEN) {
              const chunk = Buffer.from(msg.media.payload, "base64");
              deepgramWs.send(chunk);
            }
            break;

          case "stop":
            console.info(`[media-stream] Stream parado callId=${callId}`);
            deepgramWs?.close();
            break;
        }
      } catch {
        // Mensagem não-JSON ou parse error — ignora silenciosamente
      }
    });

    ws.on("close", () => {
      deepgramWs?.close();
      console.info(`[media-stream] WebSocket fechado callId=${callId}`);
    });

    ws.on("error", (err) => {
      console.error(`[media-stream] WebSocket error callId=${callId}:`, err.message);
      deepgramWs?.close();
    });
  });

  console.info("[media-stream] WebSocket server configurado (Media Streams + Deepgram)");
}
