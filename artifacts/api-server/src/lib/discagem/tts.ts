/**
 * Text-to-Speech com fallback automático entre Cartesia e ElevenLabs.
 * Ordem configurada em Settings → Discagem → "Prioridade TTS".
 *
 * synthesizeMulawBuffer() → buffer mulaw 8kHz para streaming via WebSocket Twilio.
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
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

// ── Conversão MP3 → mulaw 8kHz via ffmpeg ────────────────────────
export async function mp3ToMulaw(mp3Buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-i", "pipe:0",
      "-ar", "8000",
      "-ac", "1",
      "-f", "mulaw",
      "pipe:1",
    ]);
    const chunks: Buffer[] = [];
    ff.stdout.on("data", (c: Buffer) => chunks.push(c));
    ff.stdout.on("end", () => resolve(Buffer.concat(chunks)));
    ff.stderr.on("data", () => {}); // ffmpeg logs stderr — suprimir
    ff.on("error", reject);
    ff.stdin.write(mp3Buffer);
    ff.stdin.end();
  });
}

/** Converte arquivo MP3 salvo em disco para buffer mulaw 8kHz */
export async function mp3FileToMulaw(mp3Path: string): Promise<Buffer> {
  const mp3Buffer = await readFile(mp3Path);
  return mp3ToMulaw(mp3Buffer);
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
      model_id: "sonic-2",
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

// ── ElevenLabs (MP3) ─────────────────────────────────────────────
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

// ── ElevenLabs (mulaw 8kHz direto) ───────────────────────────────
async function synthesizeElevenLabsMulaw(text: string, apiKey: string, voiceId: string): Promise<Buffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=ulaw_8000`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 401 || res.status === 402 || err.toLowerCase().includes("credit") || err.toLowerCase().includes("quota")) {
      const e = new Error(`CREDIT_ERROR: ElevenLabs — ${err}`);
      (e as any).creditError = "ELEVENLABS";
      throw e;
    }
    throw new Error(`ElevenLabs mulaw error ${res.status}: ${err}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// ── Interface pública com fallback ────────────────────────────────
export async function synthesize(
  text: string,
  preferredProvider: TtsProvider = "elevenlabs",
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
      if (provider === "cartesia") {
        if (!cfg.cartesiaApiKey) {
          console.warn(`[tts] Cartesia pulado — API key não configurada`);
          continue;
        }
        const vid = voiceIdOverride || cfg.cartesiaVoiceId;
        if (!vid) { console.warn("[tts] Cartesia: voice ID não configurado"); continue; }
        const id = await synthesizeCartesia(text, cfg.cartesiaApiKey, vid);
        if (provider !== preferredProvider) console.warn(`[tts] Fallback para Cartesia (preferido: ${preferredProvider})`);
        return { id, providerUsed: "cartesia" };
      } else if (provider === "elevenlabs") {
        if (!cfg.elevenlabsApiKey) {
          console.warn(`[tts] ElevenLabs pulado — API key não configurada (adicione em Configurações → Discagem → Chave ElevenLabs)`);
          continue;
        }
        const vid = voiceIdOverride || cfg.elevenlabsVoiceId;
        if (!vid) {
          console.warn("[tts] ElevenLabs pulado — Voice ID não configurado (adicione em Configurações → Discagem → Voice ID ElevenLabs)");
          continue;
        }
        const id = await synthesizeElevenLabs(text, cfg.elevenlabsApiKey, vid);
        return { id, providerUsed: "elevenlabs" };
      }
    } catch (err: unknown) {
      lastError = err;
      const isCreditErr = (err as any)?.creditError;
      if (isCreditErr) {
        console.warn(`[tts] Crédito esgotado em ${provider}, tentando próximo...`);
        if (provider === order.at(-1)) throw err; // último da lista
        continue;
      }
      console.warn(`[tts] Erro em ${provider}:`, (err as Error).message);
      throw err;
    }
  }

  const e = new Error("CREDIT_ERROR: Todos os provedores TTS sem crédito ou sem chave configurada");
  (e as any).creditError = "ALL_TTS";
  throw e;
}

/**
 * Síntese direta em mulaw 8kHz — para streaming de saída via WebSocket Twilio.
 * Tenta ElevenLabs (output nativo ulaw_8000) e converte via ffmpeg como fallback.
 */
export async function synthesizeMulawBuffer(
  text: string,
  preferredProvider: TtsProvider = "elevenlabs",
  voiceIdOverride?: string,
): Promise<Buffer> {
  const cfg = await getDiscagemSettings();

  // Prioridade: ElevenLabs com saída nativa ulaw_8000 (sem conversão)
  if (cfg.elevenlabsApiKey) {
    const vid = voiceIdOverride || cfg.elevenlabsVoiceId;
    if (vid) {
      try {
        const buf = await synthesizeElevenLabsMulaw(text, cfg.elevenlabsApiKey, vid);
        console.info(`[tts] mulaw via ElevenLabs nativo (${buf.length} bytes)`);
        return buf;
      } catch (e) {
        console.warn("[tts] ElevenLabs mulaw nativo falhou, convertendo via ffmpeg:", (e as Error).message);
      }
    }
  }

  // Fallback: gera MP3 via qualquer provider e converte com ffmpeg
  const { id } = await synthesize(text, preferredProvider, voiceIdOverride);
  const mp3Path = path.join(TMP_AUDIO_DIR, `${id}.mp3`);
  return mp3FileToMulaw(mp3Path);
}

/** URL pública do áudio para usar no TwiML <Play> */
export async function audioUrl(id: string): Promise<string> {
  const cfg = await getDiscagemSettings();
  const host = cfg.publicHostname || process.env.PUBLIC_HOSTNAME || "http://localhost:8080";
  return `${host}/api/discagem/audio/${id}`;
}
