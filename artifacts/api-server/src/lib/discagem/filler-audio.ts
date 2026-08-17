/**
 * Gerenciador de áudios de preenchimento ("fillers").
 *
 * Pré-gera frases curtas e naturais em português com TTS ao primeiro uso.
 * Em modo de streaming bidirecional, converte para mulaw 8kHz via cache.
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { synthesize, mp3ToMulaw, TMP_AUDIO_DIR } from "./tts";
import { audioUrl } from "./tts";

const FILLER_DIR = path.join(TMP_AUDIO_DIR, "fillers");
const FILLER_MANIFEST = path.join(FILLER_DIR, "manifest.json");

// Frases de preenchimento — curtas, sem palavras proibidas, sem sons de "amham"
// PROIBIDO: "Aham", "Hmm", "Hm", qualquer som gutural — soam robotizados ao telefone
export const FILLER_PHRASES = [
  "Pois é.",
  "Um momento.",
  "Deixa eu ver.",
  "Entendo.",
  "Pode falar.",
  "Claro, claro.",
  "Sim, sim.",
  "Tá bom.",
];

interface FillerManifest {
  [phrase: string]: string; // phrase → audioId
}

let fillerCache: FillerManifest | null = null;
let initPromise: Promise<void> | null = null;

// Cache mulaw em memória: phrase → Buffer de mulaw 8kHz
const mulawCache = new Map<string, Buffer>();

async function ensureFillerDir() {
  if (!existsSync(FILLER_DIR)) await mkdir(FILLER_DIR, { recursive: true });
}

/**
 * Pré-gera todos os fillers com TTS. Idempotente — só gera se não existir.
 */
export async function initFillerAudio(): Promise<void> {
  if (fillerCache) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await ensureFillerDir();

    let manifest: FillerManifest = {};
    if (existsSync(FILLER_MANIFEST)) {
      try {
        const raw = await readFile(FILLER_MANIFEST, "utf8");
        manifest = JSON.parse(raw);
      } catch {}
    }

    let changed = false;
    for (const phrase of FILLER_PHRASES) {
      if (manifest[phrase]) {
        const filePath = path.join(TMP_AUDIO_DIR, `${manifest[phrase]}.mp3`);
        if (existsSync(filePath)) continue;
      }
      try {
        const { id } = await synthesize(phrase, "cartesia");
        manifest[phrase] = id;
        changed = true;
        console.log(`[filler-audio] Gerado: "${phrase}" → ${id}`);
      } catch (err) {
        console.warn(`[filler-audio] Falha ao gerar filler "${phrase}":`, err);
      }
    }

    if (changed) {
      await writeFile(FILLER_MANIFEST, JSON.stringify(manifest, null, 2));
    }

    fillerCache = manifest;
    console.log(`[filler-audio] ${Object.keys(manifest).length}/${FILLER_PHRASES.length} fillers prontos`);
  })();

  return initPromise;
}

const THINKING_FILLERS = ["Um momento.", "Deixa eu ver.", "Pois é."];
const ACK_FILLERS = ["Entendo.", "Pode falar.", "Sim, sim.", "Tá bom."];

export async function getFillerUrl(group: "thinking" | "ack" | "any" = "any"): Promise<string | null> {
  await initFillerAudio();
  if (!fillerCache) return null;

  const pool = group === "thinking" ? THINKING_FILLERS
    : group === "ack" ? ACK_FILLERS
    : FILLER_PHRASES;

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (const phrase of shuffled) {
    const id = fillerCache[phrase];
    if (!id) continue;
    const filePath = path.join(TMP_AUDIO_DIR, `${id}.mp3`);
    if (existsSync(filePath)) return audioUrl(id);
  }
  return null;
}

/**
 * Retorna buffer mulaw 8kHz de um filler — para streaming bidirecional via WebSocket.
 * Cache em memória para evitar conversão repetida com ffmpeg.
 */
export async function getFillerMulawBuffer(group: "thinking" | "ack" | "any" = "thinking"): Promise<Buffer | null> {
  await initFillerAudio();
  if (!fillerCache) return null;

  const pool = group === "thinking" ? THINKING_FILLERS
    : group === "ack" ? ACK_FILLERS
    : FILLER_PHRASES;

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (const phrase of shuffled) {
    const id = fillerCache[phrase];
    if (!id) continue;

    // Cache hit
    if (mulawCache.has(phrase)) return mulawCache.get(phrase)!;

    const mp3Path = path.join(TMP_AUDIO_DIR, `${id}.mp3`);
    if (!existsSync(mp3Path)) continue;

    try {
      const mp3Buf = await readFile(mp3Path);
      const mulawBuf = await mp3ToMulaw(mp3Buf);
      mulawCache.set(phrase, mulawBuf);
      return mulawBuf;
    } catch (err) {
      console.warn(`[filler-audio] Erro ao converter mulaw para "${phrase}":`, err);
    }
  }
  return null;
}

/** Invalida o cache de fillers (ex: quando a voz TTS for trocada) */
export function invalidateFillerCache() {
  fillerCache = null;
  initPromise = null;
  mulawCache.clear();
}
