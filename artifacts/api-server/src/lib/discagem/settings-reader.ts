/**
 * Lê as configurações de discagem do banco de dados.
 * Substitui as variáveis de ambiente — tudo é configurado pela UI admin.
 */

import { db, settingsTable } from "@workspace/db";

export interface DiscagemSettings {
  // Twilio
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  // IA — lista ordenada de prioridade
  aiFallback: string[];   // ex: ["deepseek","claude","openai"]
  // Modelos
  claudeModel: string;
  deepseekModel: string;
  openaiModel: string;
  // API Keys — IA
  claudeApiKey: string;
  deepseekApiKey: string;
  openaiApiKey: string;
  // TTS — lista ordenada de prioridade
  ttsFallback: string[];  // ex: ["cartesia","elevenlabs"]
  cartesiaApiKey: string;
  cartesiaVoiceId: string;         // fallback global Cartesia
  willianCartesiaVoiceId: string;  // voz Cartesia do agente Willian
  alineCartesiaVoiceId: string;    // voz Cartesia do agente Aline
  elevenlabsApiKey: string;
  elevenlabsVoiceId: string;       // fallback global ElevenLabs
  willianElevenlabsVoiceId: string;
  alineElevenlabsVoiceId: string;
  // STT
  deepgramApiKey: string;
  // URL pública (para webhooks Twilio)
  publicHostname: string;
}

let _cache: DiscagemSettings | null = null;
let _cacheAt = 0;
const CACHE_TTL_MS = 30_000; // 30s cache

export async function getDiscagemSettings(): Promise<DiscagemSettings> {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL_MS) return _cache;

  const rows = await db.select().from(settingsTable).limit(1);
  const s = rows[0];
  if (!s) throw new Error("Settings não encontradas no banco de dados.");

  const parseFallback = (raw: string | null, def: string[]): string[] => {
    try { return JSON.parse(raw ?? "[]"); } catch { return def; }
  };

  _cache = {
    twilioAccountSid: s.twilioAccountSid ?? process.env.TWILIO_ACCOUNT_SID ?? "",
    twilioAuthToken: s.twilioAuthToken ?? process.env.TWILIO_AUTH_TOKEN ?? "",
    twilioPhoneNumber: s.twilioPhoneNumber ?? process.env.TWILIO_PHONE_NUMBER ?? "",
    aiFallback: parseFallback(s.discagemAiFallback, ["deepseek", "claude", "openai"]),
    claudeModel: s.claudeModel ?? "claude-3-5-haiku-20241022",
    deepseekModel: s.deepseekModel ?? "deepseek-chat",
    openaiModel: s.openaiModel ?? "gpt-4o-mini",
    claudeApiKey: s.claudeApiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
    deepseekApiKey: s.deepseekApiKey ?? process.env.DEEPSEEK_API_KEY ?? "",
    openaiApiKey: s.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "",
    ttsFallback: parseFallback(s.discagemTtsFallback, ["cartesia", "elevenlabs"]),
    cartesiaApiKey: s.cartesiaApiKey ?? process.env.CARTESIA_API_KEY ?? "",
    cartesiaVoiceId: s.cartesiaVoiceId ?? process.env.CARTESIA_VOICE_ID ?? "",
    willianCartesiaVoiceId: (s as any).willianCartesiaVoiceId ?? "",
    alineCartesiaVoiceId: (s as any).alineCartesiaVoiceId ?? "",
    elevenlabsApiKey: s.elevenlabsApiKey ?? process.env.ELEVENLABS_API_KEY ?? "",
    elevenlabsVoiceId: s.elevenlabsVoiceId ?? "",
    willianElevenlabsVoiceId: (s as any).willianElevenlabsVoiceId ?? "",
    alineElevenlabsVoiceId: (s as any).alineElevenlabsVoiceId ?? "",
    deepgramApiKey: s.deepgramApiKey ?? process.env.DEEPGRAM_API_KEY ?? "",
    publicHostname: s.discagemPublicHostname ?? process.env.PUBLIC_HOSTNAME ?? "",
  };
  _cacheAt = Date.now();
  return _cache;
}

/** Invalida o cache (chamar após salvar settings) */
export function invalidateDiscagemSettingsCache() {
  _cache = null;
}
