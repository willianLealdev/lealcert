/**
 * Estado em memória compartilhado do pipeline de voz da discagem.
 * Usado por routes/discagem.ts e lib/discagem/media-stream-handler.ts.
 */

import { runAgentTurn } from "./ai-agent";
import { synthesize, audioUrl } from "./tts";
import { resolveVoiceId } from "./opening-pregenerate";

export type ConvTurn = { role: "user" | "assistant"; text: string; ts: string };

export interface PendingPayload {
  audioUrl: string;
  shouldEndCall: boolean;
  isOptOut: boolean;
  transferToHuman?: boolean;
  callbackRequested?: boolean;
  capturedEmail?: string | null;
  history: ConvTurn[];
  err?: unknown;
}

export interface PendingResult {
  promise: Promise<PendingPayload>;
  startedAt: number;
}

/** Histórico de conversa por callId */
export const conversationCache = new Map<number, ConvTurn[]>();

/** Resultado IA+TTS em background por callId */
export const pendingResults = new Map<number, PendingResult>();

/** Calls usando Media Streams (stream mode) — as demais usam Gather mode */
export const streamModeCalls = new Set<number>();

export function getConvHistory(callId: number): ConvTurn[] {
  if (!conversationCache.has(callId)) conversationCache.set(callId, []);
  return conversationCache.get(callId)!;
}

/**
 * Dispara o pipeline IA+TTS em background para um turno de fala.
 * Armazena o resultado em pendingResults para o /reply consumir.
 */
export function processSpeechTurn(
  callId: number,
  campaign: {
    aiModel?: string | null;
    agentName?: string | null;
    ttsProvider?: string | null;
    ttsVoiceId?: string | null;
    systemPrompt?: string | null;
  },
  speechText: string,
): void {
  const history = getConvHistory(callId);
  history.push({ role: "user", text: speechText, ts: new Date().toISOString() });

  const agentName = (campaign.agentName ?? "Willian") as string;
  const provider = (campaign.ttsProvider ?? "elevenlabs") as "cartesia" | "elevenlabs";

  const promise: Promise<PendingPayload> = (async () => {
    const aiResp = await runAgentTurn(
      history,
      campaign.aiModel as any,
      agentName,
      campaign.systemPrompt ?? undefined,
    );
    history.push({ role: "assistant", text: aiResp.text, ts: new Date().toISOString() });
    const voiceId = await resolveVoiceId(campaign.ttsVoiceId, agentName, provider);
    const { id: ttsId } = await synthesize(aiResp.text, provider, voiceId);
    const url = await audioUrl(ttsId);
    return {
      audioUrl: url,
      shouldEndCall: aiResp.shouldEndCall,
      isOptOut: aiResp.isOptOut,
      transferToHuman: aiResp.transferToHuman,
      callbackRequested: aiResp.callbackRequested,
      capturedEmail: aiResp.capturedEmail ?? null,
      history,
    };
  })().catch(err => ({
    audioUrl: "",
    shouldEndCall: true,
    isOptOut: false,
    transferToHuman: false,
    callbackRequested: false,
    capturedEmail: null,
    history,
    err,
  }));

  pendingResults.set(callId, { promise, startedAt: Date.now() });
}
