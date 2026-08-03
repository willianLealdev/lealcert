/**
 * Motor de IA para o agente de discagem.
 * Suporta: Claude (Anthropic) e DeepSeek (via OpenAI-compatible API).
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AGENT_SYSTEM_PROMPT } from "./config";

export type AiModel = "claude" | "deepseek";

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
  ts: string;
}

export interface AgentResponse {
  text: string;
  shouldEndCall: boolean;
  isOptOut: boolean;
  model: AiModel;
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

// ── Detecção de erro de crédito por API ─────────────────────────
export function detectCreditError(error: unknown): string | null {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  if (lower.includes("insufficient_quota") || lower.includes("credit") || lower.includes("billing") || lower.includes("quota")) {
    return msg;
  }
  return null;
}

// ── Claude ──────────────────────────────────────────────────────
async function callClaude(
  turns: ConversationTurn[],
  systemPrompt: string,
): Promise<string> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });

  const messages = turns.map((t) => ({
    role: t.role as "user" | "assistant",
    content: t.text,
  }));

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 300,
    system: systemPrompt,
    messages,
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Claude returned non-text block");
  return block.text;
}

// ── DeepSeek ─────────────────────────────────────────────────────
async function callDeepSeek(
  turns: ConversationTurn[],
  systemPrompt: string,
): Promise<string> {
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY!,
    baseURL: "https://api.deepseek.com",
  });

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...turns.map((t) => ({
      role: t.role as "user" | "assistant",
      content: t.text,
    })),
  ];

  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    max_tokens: 300,
    messages,
  });

  return response.choices[0]?.message?.content ?? "";
}

// ── Entrada principal ────────────────────────────────────────────
export async function runAgentTurn(
  turns: ConversationTurn[],
  model: AiModel = "claude",
  customSystemPrompt?: string,
): Promise<AgentResponse> {
  const systemPrompt = customSystemPrompt || AGENT_SYSTEM_PROMPT;
  const lastUserText = turns.at(-1)?.text ?? "";

  // Verificação de opt-out antes de chamar a IA
  if (detectOptOut(lastUserText)) {
    return {
      text: "Entendido. Vou retirar seu número da nossa lista. Tenha um ótimo dia!",
      shouldEndCall: true,
      isOptOut: true,
      model,
    };
  }

  let text: string;
  if (model === "claude") {
    text = await callClaude(turns, systemPrompt);
  } else {
    text = await callDeepSeek(turns, systemPrompt);
  }

  // Detecta opt-out na resposta gerada pela IA (ela pode ter decidido encerrar)
  const isOptOut = detectOptOut(lastUserText);
  const shouldEndCall = isOptOut || /\[ENCERRAR\]|\[FIM\]/i.test(text);

  // Remove marcações internas do texto final
  const cleanText = text.replace(/\[(ENCERRAR|FIM|OPTOUT)\]/gi, "").trim();

  return { text: cleanText, shouldEndCall, isOptOut, model };
}
