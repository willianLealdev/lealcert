/**
 * Gerenciador de áudios de preenchimento ("fillers").
 *
 * Pré-gera frases curtas e naturais em português com TTS ao primeiro uso.
 * São tocados imediatamente enquanto a IA e o TTS principal processam em paralelo,
 * eliminando o silêncio percebido pelo contato.
 *
 * Duração típica de cada filler: 0.5–1.2s
 * Tempo de processamento IA+TTS: 1.5–3s
 * → o contato ouve resposta imediata, sem perceber a latência real
 */

import { writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { synthesize, TMP_AUDIO_DIR } from "./tts";
import { audioUrl } from "./tts";

const FILLER_DIR = path.join(TMP_AUDIO_DIR, "fillers");
const FILLER_MANIFEST = path.join(FILLER_DIR, "manifest.json");

// Frases de preenchimento — variadas para soar natural, não robótico
export const FILLER_PHRASES = [
  "Hmm...",
  "Entendi.",
  "Certo.",
  "Ok.",
  "Um instante.",
  "Com certeza.",
  "Claro.",
  "Aham.",
];

interface FillerManifest {
  [phrase: string]: string; // phrase → audioId
}

let fillerCache: FillerManifest | null = null;
let initPromise: Promise<void> | null = null;

async function ensureFillerDir() {
  if (!existsSync(FILLER_DIR)) await mkdir(FILLER_DIR, { recursive: true });
}

/**
 * Pré-gera todos os fillers com TTS. Idempotente — só gera se não existir.
 * Chamado no primeiro uso (lazy) para não bloquear o startup.
 */
export async function initFillerAudio(): Promise<void> {
  if (fillerCache) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await ensureFillerDir();

    // Tenta carregar manifest existente
    let manifest: FillerManifest = {};
    if (existsSync(FILLER_MANIFEST)) {
      try {
        const raw = await import("node:fs/promises").then(fs => fs.readFile(FILLER_MANIFEST, "utf8"));
        manifest = JSON.parse(raw);
      } catch {}
    }

    // Gera os que ainda não existem
    let changed = false;
    for (const phrase of FILLER_PHRASES) {
      if (manifest[phrase]) {
        // Verifica se o arquivo ainda existe
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

/**
 * Retorna a URL pública de um filler aleatório (ou do grupo desejado).
 * group: "thinking" = fillers que implicam "estou processando"
 *        "ack"      = fillers de confirmação rápida
 *        "any"      = qualquer um
 */
const THINKING_FILLERS = ["Hmm...", "Um instante.", "Aham."];
const ACK_FILLERS = ["Entendi.", "Certo.", "Ok.", "Claro.", "Com certeza."];

export async function getFillerUrl(group: "thinking" | "ack" | "any" = "any"): Promise<string | null> {
  await initFillerAudio();
  if (!fillerCache) return null;

  const pool = group === "thinking" ? THINKING_FILLERS
    : group === "ack" ? ACK_FILLERS
    : FILLER_PHRASES;

  // Embaralha e tenta até encontrar um com arquivo
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (const phrase of shuffled) {
    const id = fillerCache[phrase];
    if (!id) continue;
    const filePath = path.join(TMP_AUDIO_DIR, `${id}.mp3`);
    if (existsSync(filePath)) return audioUrl(id);
  }
  return null;
}

/** Invalida o cache de fillers (ex: quando a voz TTS for trocada nas configurações) */
export function invalidateFillerCache() {
  fillerCache = null;
  initPromise = null;
}
