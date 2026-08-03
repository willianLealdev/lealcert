/**
 * Text-to-Speech: Cartesia e ElevenLabs.
 * Gera áudio MP3, salva em /tmp, retorna o caminho local.
 * A rota GET /api/discagem/audio/:id serve o arquivo.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type TtsProvider = "cartesia" | "elevenlabs";

export const TMP_AUDIO_DIR = "/tmp/discagem-audio";

async function ensureDir() {
  if (!existsSync(TMP_AUDIO_DIR)) {
    await mkdir(TMP_AUDIO_DIR, { recursive: true });
  }
}

function audioId(): string {
  return crypto.randomBytes(12).toString("hex");
}

// ── Cartesia ─────────────────────────────────────────────────────
async function synthesizeCartesia(text: string, voiceId?: string): Promise<string> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error("CARTESIA_API_KEY não configurada");

  const vid = voiceId || process.env.CARTESIA_VOICE_ID || "a0e99841-438c-4a64-b679-ae501e7d6091";

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
      voice: { mode: "id", id: vid },
      output_format: { container: "mp3", encoding: "mp3", sample_rate: 44100 },
      language: "pt",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 402 || err.toLowerCase().includes("credit") || err.toLowerCase().includes("insufficient")) {
      const e = new Error(`CREDIT_ERROR: ${err}`);
      (e as any).creditError = "CARTESIA";
      throw e;
    }
    throw new Error(`Cartesia TTS error ${res.status}: ${err}`);
  }

  await ensureDir();
  const id = audioId();
  const filePath = path.join(TMP_AUDIO_DIR, `${id}.mp3`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(filePath, buf);
  return id;
}

// ── ElevenLabs ───────────────────────────────────────────────────
async function synthesizeElevenLabs(text: string, voiceId?: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY não configurada");

  const vid = voiceId || "21m00Tcm4TlvDq8ikWAM"; // Rachel (pt-BR compatível)

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 401 || res.status === 402 || err.toLowerCase().includes("credit") || err.toLowerCase().includes("quota")) {
      const e = new Error(`CREDIT_ERROR: ${err}`);
      (e as any).creditError = "ELEVENLABS";
      throw e;
    }
    throw new Error(`ElevenLabs TTS error ${res.status}: ${err}`);
  }

  await ensureDir();
  const id = audioId();
  const filePath = path.join(TMP_AUDIO_DIR, `${id}.mp3`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(filePath, buf);
  return id;
}

// ── Interface pública ─────────────────────────────────────────────
export async function synthesize(
  text: string,
  provider: TtsProvider = "cartesia",
  voiceId?: string,
): Promise<string> {
  if (provider === "elevenlabs") {
    return synthesizeElevenLabs(text, voiceId);
  }
  return synthesizeCartesia(text, voiceId);
}

/** Gera a URL pública do áudio para usar no TwiML <Play> */
export function audioUrl(id: string): string {
  const host = process.env.PUBLIC_HOSTNAME || "http://localhost:8080";
  return `${host}/api/discagem/audio/${id}`;
}
