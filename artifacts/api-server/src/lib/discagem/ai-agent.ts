/**
 * Motor de IA com fallback automático entre provedores.
 * Ordem configurada em Settings → Discagem → "Prioridade IA".
 * Se um provedor falhar por crédito esgotado, tenta o próximo da lista.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getDiscagemSettings } from "./settings-reader";
import { AGENT_SYSTEM_PROMPT, AGENT_VOICE_IDS, type AgentName } from "./config";
import { getSiteCacheBlock, refreshSiteCache } from "./site-cache";

// Inicia o cache do site em background (sem bloquear)
refreshSiteCache().catch(() => {});

export type AiModel = "claude" | "deepseek" | "openai";

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
  ts: string;
}

export interface AgentResponse {
  text: string;
  shouldEndCall: boolean;
  isOptOut: boolean;
  modelUsed: AiModel;
  capturedEmail?: string | null;  // e-mail capturado via [REGISTRAR_EMAIL:xxx]
}

// ── Detecção de opt-out ──────────────────────────────────────────
const OPT_OUT_PATTERNS = [
  /não quero mais.*ligar/i,
  /não me ligue/i,
  /tire.*meu.*número/i,
  /remov.*meu.*contato/i,
  /não tenho interesse/i,
  /pode me tirar da lista/i,
  /não ligue mais/i,
  /me coloca em lista negra/i,
  /opt.?out/i,
  /descadastr/i,
];

export function detectOptOut(text: string): boolean {
  return OPT_OUT_PATTERNS.some((p) => p.test(text));
}

// ── Detecção de erro de crédito ──────────────────────────────────
export function detectCreditError(error: unknown): string | null {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  if (
    lower.includes("insufficient_quota") ||
    lower.includes("credit") ||
    lower.includes("billing") ||
    lower.includes("quota") ||
    lower.includes("rate_limit") ||
    lower.includes("overloaded") ||
    lower.includes("529")
  ) {
    return msg;
  }
  return null;
}

// ── Claude ──────────────────────────────────────────────────────
async function callClaude(turns: ConversationTurn[], systemPrompt: string, apiKey: string, model: string): Promise<string> {
  const client = new Anthropic({ apiKey });
  const messages = turns.map(t => ({ role: t.role as "user" | "assistant", content: t.text }));
  const response = await client.messages.create({
    model,
    max_tokens: 300,
    system: systemPrompt,
    messages,
  });
  const block = response.content[0];
  if (block.type !== "text") throw new Error("Claude returned non-text block");
  return block.text;
}

// ── DeepSeek ─────────────────────────────────────────────────────
async function callDeepSeek(turns: ConversationTurn[], systemPrompt: string, apiKey: string, model: string): Promise<string> {
  const client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...turns.map(t => ({ role: t.role as "user" | "assistant", content: t.text })),
  ];
  const response = await client.chat.completions.create({ model, max_tokens: 300, messages });
  return response.choices[0]?.message?.content ?? "";
}

// ── OpenAI ──────────────────────────────────────────────────────
async function callOpenAI(turns: ConversationTurn[], systemPrompt: string, apiKey: string, model: string): Promise<string> {
  const client = new OpenAI({ apiKey });
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...turns.map(t => ({ role: t.role as "user" | "assistant", content: t.text })),
  ];
  const response = await client.chat.completions.create({ model, max_tokens: 300, messages });
  return response.choices[0]?.message?.content ?? "";
}

// ── Entrada principal com fallback ───────────────────────────────
export async function runAgentTurn(
  turns: ConversationTurn[],
  preferredModel: AiModel = "deepseek",
  agentName: string = "Willian",
  customSystemPrompt?: string,
): Promise<AgentResponse> {
  const cfg = await getDiscagemSettings();

  // Injeta o nome do agente + conteúdo atual do site no prompt
  const siteBlock = getSiteCacheBlock();
  const basePrompt = customSystemPrompt
    ?? AGENT_SYSTEM_PROMPT.replaceAll("{AGENT_NAME}", agentName);
  const prompt = siteBlock ? `${basePrompt}\n\n${siteBlock}` : basePrompt;

  const lastUserText = turns.at(-1)?.text ?? "";

  // Verificação de opt-out antes de chamar a IA
  if (detectOptOut(lastUserText)) {
    return {
      text: "Entendido. Vou retirar seu número da nossa lista. Tenha um ótimo dia!",
      shouldEndCall: true,
      isOptOut: true,
      modelUsed: preferredModel,
    };
  }

  // Ordena a lista de fallback: coloca o preferredModel primeiro
  const fallbackOrder = [
    preferredModel,
    ...cfg.aiFallback.filter(m => m !== preferredModel),
  ] as AiModel[];

  let lastError: unknown;

  for (const model of fallbackOrder) {
    try {
      let text = "";

      if (model === "claude" && cfg.claudeApiKey) {
        text = await callClaude(turns, prompt, cfg.claudeApiKey, cfg.claudeModel);
      } else if (model === "deepseek" && cfg.deepseekApiKey) {
        text = await callDeepSeek(turns, prompt, cfg.deepseekApiKey, cfg.deepseekModel);
      } else if (model === "openai" && cfg.openaiApiKey) {
        text = await callOpenAI(turns, prompt, cfg.openaiApiKey, cfg.openaiModel);
      } else {
        // Chave não configurada — pula para o próximo
        continue;
      }

      const isOptOut = detectOptOut(lastUserText);
      const shouldEndCall = isOptOut || /\[(ENCERRAR|FIM|OPTOUT)\]/i.test(text);

      // Extrai e-mail capturado via [REGISTRAR_EMAIL:xxx]
      const emailMatch = text.match(/\[REGISTRAR_EMAIL:([^\]]+)\]/i);
      const capturedEmail = emailMatch ? emailMatch[1].trim() : null;

      const cleanText = text
        .replace(/\[(ENCERRAR|FIM|OPTOUT)\]/gi, "")
        .replace(/\[REGISTRAR_EMAIL:[^\]]+\]/gi, "")
        .trim();

      return { text: cleanText, shouldEndCall, isOptOut, modelUsed: model, capturedEmail };

    } catch (err: unknown) {
      lastError = err;
      const creditErr = detectCreditError(err);
      if (creditErr) {
        // Marca erro de crédito neste modelo e tenta o próximo
        console.warn(`[ai-agent] Crédito esgotado em ${model}, tentando próximo...`);
        const e = new Error(`CREDIT_ERROR: ${model.toUpperCase()} — ${creditErr}`);
        (e as any).creditError = model.toUpperCase();
        (e as any).triedAll = model === fallbackOrder.at(-1);
        if ((e as any).triedAll) throw e;
        continue;
      }
      // Erro não relacionado a crédito — propaga imediatamente
      throw err;
    }
  }

  // Todos os modelos falharam por crédito esgotado
  const e = new Error(`CREDIT_ERROR: Todos os modelos de IA sem crédito — ${fallbackOrder.join(", ")}`);
  (e as any).creditError = "ALL_AI";
  throw e;
}
