/**
 * Pré-geração do áudio de abertura da ligação.
 *
 * Gera IA + TTS ANTES de discar para o Twilio, de modo que quando
 * o webhook /voice/:callId for chamado (pessoa já atendeu), o áudio
 * já esteja pronto — sem silêncio de 3-5s no início da ligação.
 */

import { runAgentTurn, type ConversationTurn } from "./ai-agent";
import { synthesize, audioUrl } from "./tts";
import { getDiscagemSettings } from "./settings-reader";

export interface PreGeneratedOpening {
  audioUrl: string;
  agentText: string;
}

// Cache em memória: callId → dados pré-gerados
// TTL implícito: consumido pelo webhook e não reutilizado.
const openingCache = new Map<number, PreGeneratedOpening>();

/** Retorna e REMOVE o opening pré-gerado do cache (uso único). */
export function consumePreGeneratedOpening(callId: number): PreGeneratedOpening | undefined {
  const val = openingCache.get(callId);
  openingCache.delete(callId);
  return val;
}

/**
 * Resolve o voice ID correto para um agente/provider.
 * Prioridade: ttsVoiceId da campanha > ID do agente nas settings > fallback global.
 */
export async function resolveVoiceId(
  campaignVoiceId: string | null | undefined,
  agentName: string,
  provider: "cartesia" | "elevenlabs",
): Promise<string | undefined> {
  if (campaignVoiceId) return campaignVoiceId;
  const cfg = await getDiscagemSettings();
  const name = (agentName ?? "Willian").toLowerCase();
  if (provider === "cartesia") {
    if (name === "willian") return cfg.willianCartesiaVoiceId || cfg.cartesiaVoiceId || undefined;
    if (name === "aline")   return cfg.alineCartesiaVoiceId   || cfg.cartesiaVoiceId || undefined;
    return cfg.cartesiaVoiceId || undefined;
  } else {
    if (name === "willian") return cfg.willianElevenlabsVoiceId || cfg.elevenlabsVoiceId || undefined;
    if (name === "aline")   return cfg.alineElevenlabsVoiceId   || cfg.elevenlabsVoiceId || undefined;
    return cfg.elevenlabsVoiceId || undefined;
  }
}

/**
 * Pré-gera o texto de abertura via IA + TTS e armazena no cache.
 * Chamado ANTES de initiateCall() no scheduler e no test-call.
 * Se falhar, o webhook faz geração on-demand como fallback.
 */
export async function preGenerateOpening(
  callId: number,
  campaign: {
    aiModel?: string | null;
    agentName?: string | null;
    ttsProvider?: string | null;
    ttsVoiceId?: string | null;
    systemPrompt?: string | null;
  },
): Promise<void> {
  try {
    const agentName = (campaign.agentName ?? "Willian") as string;
    const provider = (campaign.ttsProvider ?? "cartesia") as "cartesia" | "elevenlabs";

    const openingHistory: ConversationTurn[] = [
      { role: "user", text: "[INÍCIO DA LIGAÇÃO]", ts: new Date().toISOString() },
    ];

    const aiResp = await runAgentTurn(
      openingHistory,
      campaign.aiModel as any,
      agentName,
      campaign.systemPrompt ?? undefined,
    );

    const voiceId = await resolveVoiceId(campaign.ttsVoiceId, agentName, provider);
    const { id: ttsId } = await synthesize(aiResp.text, provider, voiceId);
    const url = await audioUrl(ttsId);

    openingCache.set(callId, { audioUrl: url, agentText: aiResp.text });
    console.info(`[discagem] Opening pré-gerado callId=${callId} (${aiResp.text.length} chars)`);
  } catch (err) {
    // Falha silenciosa — webhook faz geração on-demand como fallback
    console.warn(`[discagem] preGenerateOpening callId=${callId} falhou:`, (err as Error).message);
  }
}
