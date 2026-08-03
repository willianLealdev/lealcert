/**
 * Text-to-Speech com fallback automático entre Cartesia e ElevenLabs.
 * Ordem configurada em Settings → Discagem → "Prioridade TTS".
 */

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDiscagemSettings } from "./settings-reader";

export type TtsProvider = "cartesia" | "elevenlabs";

export const TMP_AUDIO_DIR = "/tmp/discagem-audio";

async function ensureDir() {
  if (!existsSync(TMP_AUDIO_DIR)) await mkdir(TMP_AUDIO_DIR, { recursive: true });
}

function audioId(): string {
  return crypto.randomBytes(12).toString("hex");
}

// ── Cartesia ─────────────────────────────────────────────────────
async function synthesizeCartesia(text: string, apiKey: string, voiceId: string): Promise<string> {
  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Cartesia-Version": "2024-06-10",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transcript: text,
      model_id: "sonic-multilingual",
      voice: { mode: "id", id: voiceId },
      output_format: { container: "mp3", encoding: "mp3", sample_rate: 44100 },
      language: "pt",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 402 || err.toLowerCase().includes("credit") || err.toLowerCase().includes("insufficient")) {
      const e = new Error(`CREDIT_ERROR: Cartesia — ${err}`);
      (e as any).creditError = "CARTESIA";
      throw e;
    }
    throw new Error(`Cartesia TTS error ${res.status}: ${err}`);
  }

  await ensureDir();
  const id = audioId();
  await writeFile(path.join(TMP_AUDIO_DIR, `${id}.mp3`), Buffer.from(await res.arrayBuffer()));
  return id;
}

// ── ElevenLabs ───────────────────────────────────────────────────
async function synthesizeElevenLabs(text: string, apiKey: string, voiceId: string): Promise<string> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 401 || res.status === 402 || err.toLowerCase().includes("credit") || err.toLowerCase().includes("quota")) {
      const e = new Error(`CREDIT_ERROR: ElevenLabs — ${err}`);
      (e as any).creditError = "ELEVENLABS";
      throw e;
    }
    throw new Error(`ElevenLabs TTS error ${res.status}: ${err}`);
  }

  await ensureDir();
  const id = audioId();
  await writeFile(path.join(TMP_AUDIO_DIR, `${id}.mp3`), Buffer.from(await res.arrayBuffer()));
  return id;
}

// ── Interface pública com fallback ────────────────────────────────
export async function synthesize(
  text: string,
  preferredProvider: TtsProvider = "cartesia",
  voiceIdOverride?: string,
): Promise<{ id: string; providerUsed: TtsProvider }> {
  const cfg = await getDiscagemSettings();

  // Fallback: coloca o preferido primeiro
  const order = [
    preferredProvider,
    ...cfg.ttsFallback.filter(p => p !== preferredProvider),
  ] as TtsProvider[];

  let lastError: unknown;

  for (const provider of order) {
    try {
      if (provider === "cartesia" && cfg.cartesiaApiKey) {
        const vid = voiceIdOverride || cfg.cartesiaVoiceId;
        const id = await synthesizeCartesia(text, cfg.cartesiaApiKey, vid);
        return { id, providerUsed: "cartesia" };
      } else if (provider === "elevenlabs" && cfg.elevenlabsApiKey) {
        const vid = voiceIdOverride || cfg.elevenlabsVoiceId;
        const id = await synthesizeElevenLabs(text, cfg.elevenlabsApiKey, vid);
        return { id, providerUsed: "elevenlabs" };
      }
      // Chave não configurada — pula
    } catch (err: unknown) {
      lastError = err;
      const isCreditErr = (err as any)?.creditError;
      if (isCreditErr) {
        console.warn(`[tts] Crédito esgotado em ${provider}, tentando próximo...`);
        if (provider === order.at(-1)) throw err; // último da lista
        continue;
      }
      throw err;
    }
  }

  const e = new Error("CREDIT_ERROR: Todos os provedores TTS sem crédito ou sem chave configurada");
  (e as any).creditError = "ALL_TTS";
  throw e;
}

/** URL pública do áudio para usar no TwiML <Play> */
export async function audioUrl(id: string): Promise<string> {
  const cfg = await getDiscagemSettings();
  const host = cfg.publicHostname || process.env.PUBLIC_HOSTNAME || "http://localhost:8080";
  return `${host}/api/discagem/audio/${id}`;
}
