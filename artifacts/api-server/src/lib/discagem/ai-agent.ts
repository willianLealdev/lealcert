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
import { db, couponsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// Inicia o cache do site em background (sem bloquear)
refreshSiteCache().catch(() => {});

// ── Cache do status do cupom PARCEIRO (TTL 10min) ────────────────
let cupomCache: { active: boolean; expiresAt: number } | null = null;

async function getCupomParceiroStatus(): Promise<boolean> {
  const now = Date.now();
  if (cupomCache && now < cupomCache.expiresAt) return cupomCache.active;
  try {
    const [row] = await db
      .select({ active: couponsTable.active })
      .from(couponsTable)
      .where(and(eq(couponsTable.code, "PARCEIRO"), eq(couponsTable.active, true)))
      .limit(1);
    const active = !!row;
    cupomCache = { active, expiresAt: now + 10 * 60 * 1000 };
    return active;
  } catch {
    return false;
  }
}

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
  transferToHuman: boolean;       // [TRANSFERIR_HUMANO]
  callbackRequested: boolean;     // [SOLICITAR_CALLBACK_HUMANO]
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

  // Injeta nome do agente, status do cupom e conteúdo do site no prompt
  const [cupomAtivo, siteBlock] = await Promise.all([
    getCupomParceiroStatus(),
    Promise.resolve(getSiteCacheBlock()),
  ]);
  const cupomLine = cupomAtivo
    ? "Cupom PARCEIRO está ATIVO: primeiro certificado por R$ 70,00 (normalmente R$ 90,00). Mencione-o quando fizer sentido."
    : "Cupom PARCEIRO está INATIVO no momento. NÃO mencione este cupom.";

  // Saudação dinâmica baseada no horário de Brasília
  const nowBrasilia = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const hour = nowBrasilia.getHours();
  const saudacao = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const basePrompt = (customSystemPrompt ?? AGENT_SYSTEM_PROMPT)
    .replaceAll("{AGENT_NAME}", agentName)
    .replaceAll("{CUPOM_PARCEIRO_ATIVO}", cupomLine)
    .replaceAll("{SAUDACAO}", saudacao);
  const prompt = siteBlock ? `${basePrompt}\n\n${siteBlock}` : basePrompt;

  const lastUserText = turns.at(-1)?.text ?? "";

  // Verificação de opt-out antes de chamar a IA
  if (detectOptOut(lastUserText)) {
    return {
      text: "Entendido. Vou retirar seu número da nossa lista. Tenha um ótimo dia!",
      shouldEndCall: true,
      isOptOut: true,
      transferToHuman: false,
      callbackRequested: false,
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
      const transferToHuman   = /\[TRANSFERIR_HUMANO\]/i.test(text);
      const callbackRequested = /\[SOLICITAR_CALLBACK_HUMANO\]/i.test(text);
      const shouldEndCall = isOptOut || transferToHuman || callbackRequested
        || /\[(ENCERRAR|FIM|OPTOUT)\]/i.test(text);

      // Extrai e-mail capturado via [REGISTRAR_EMAIL:xxx]
      const emailMatch = text.match(/\[REGISTRAR_EMAIL:([^\]]+)\]/i);
      const capturedEmail = emailMatch ? emailMatch[1].trim() : null;

      // Remove todos os comandos internos do texto falado
      const cleanText = text
        .replace(/\[(ENCERRAR|FIM|OPTOUT|TRANSFERIR_HUMANO|SOLICITAR_CALLBACK_HUMANO)\]/gi, "")
        .replace(/\[REGISTRAR_EMAIL:[^\]]+\]/gi, "")
        .trim();

      return { text: cleanText, shouldEndCall, isOptOut, transferToHuman, callbackRequested, modelUsed: model, capturedEmail };

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

// Re-exporta para uso nos fallbacks do opt-out inline
export function makeOptOutResponse(modelUsed: AiModel): AgentResponse {
  return {
    text: "Entendido. Vou retirar seu número da nossa lista. Tenha um ótimo dia!",
    shouldEndCall: true,
    isOptOut: true,
    transferToHuman: false,
    callbackRequested: false,
    modelUsed,
  };
}
