/**
 * Motor de IA com fallback automático entre provedores.
 * Ordem configurada em Settings → Discagem → "Prioridade IA".
 * Se um provedor falhar por crédito esgotado, tenta o próximo da lista.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getDiscagemSettings } from "./settings-reader";
import { AGENT_SYSTEM_PROMPT, type AgentName } from "./config";
import { getSiteCacheBlock, refreshSiteCache } from "./site-cache";
import { db, couponsTable, apiKeysTable, apiKeyAuditLogsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger";
import { createHermesWebhookAuth, selectExternalBrainKey } from "../api-keys";

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
  modelUsed: AiModel | "external";
  capturedEmail?: string | null;  // e-mail capturado via [REGISTRAR_EMAIL:xxx]
  promptUsed?: string;
  interestStatus?: "unknown" | "interested" | "not_interested";
  endReason?: string | null;
}

export interface ExternalBrainContext {
  callId?: number;
  campaignId?: number | null;
  contactId?: number | null;
  phoneNumber?: string;
  contactName?: string | null;
  companyName?: string | null;
  city?: string | null;
  state?: string | null;
  contactType?: string | null;
}

export async function isHermesFallbackEnabled(): Promise<boolean> {
  const keys = await db.select().from(apiKeysTable).where(eq(apiKeysTable.isActive, true));
  const key = selectExternalBrainKey(keys);
  return key?.aiFallbackEnabled !== false;
}

type HermesStage = "opening" | "qualification" | "pitch" | "objection" | "closing" | "follow_up";

function inferHermesStage(turns: ConversationTurn[]): HermesStage {
  const lastUserText = turns.at(-1)?.text.toLowerCase() ?? "";
  const fullConversation = turns.map(turn => turn.text.toLowerCase()).join(" ");
  if (turns.length <= 1 || lastUserText.includes("[início da ligação]")) return "opening";
  if (/(já tenho|não tenho interesse|afiliad|dá trabalho|vou pensar|sem tempo|não tenho tempo|mande.*e-?mail|fornecedor)/i.test(lastUserText)) {
    return "objection";
  }
  if (/(cadastro|cadastrar|começar|cupom|preço|valor|quanto custa|primeiro certificado)/i.test(lastUserText)) {
    return "closing";
  }
  if (/(retorn|outro horário|depois|amanhã|semana que vem)/i.test(lastUserText)) return "follow_up";
  if (/(volume|quantos certificados|certificadora|como trabalha)/i.test(fullConversation)) return "qualification";
  return "pitch";
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

// ── Remove fillers robóticos do início da resposta ───────────────
// O modelo às vezes ignora a regra do prompt — aqui garantimos em código.
const FILLER_PATTERN = /^(claro[,!.]?\s*|com certeza[,!.]?\s*|perfeito[,!.]?\s*|ótimo[,!.]?\s*|excelente[,!.]?\s*|com prazer[,!.]?\s*|entendido[,!.]?\s*|entendo[,!.]?\s*|certo[,!.]?\s*|ok[,!.]?\s*|okay[,!.]?\s*|sim[,!.]?\s*|ah[,!.]?\s*|hmm[,!.]?\s*|ah sim[,!.]?\s*|que bom[,!.]?\s*|que ótimo[,!.]?\s*|maravilha[,!.]?\s*)+/i;

function stripOpeningFiller(text: string): string {
  const stripped = text.replace(FILLER_PATTERN, "").trim();
  // Se após remover ficou vazio (filler era a resposta inteira), mantém o original
  return stripped.length > 0 ? stripped : text.trim();
}

function parseAgentText(
  text: string,
  lastUserText: string,
  modelUsed: AiModel | "external",
  promptUsed: string,
): AgentResponse {
  const isOptOut = detectOptOut(lastUserText);
  const transferToHuman = /\[TRANSFERIR_HUMANO\]/i.test(text);
  const callbackRequested = /\[SOLICITAR_CALLBACK_HUMANO\]/i.test(text);
  const shouldEndCall = isOptOut || transferToHuman || callbackRequested
    || /\[(ENCERRAR|FIM|OPTOUT)\]/i.test(text);
  const emailMatch = text.match(/\[REGISTRAR_EMAIL:([^\]]+)\]/i);
  const capturedEmail = emailMatch ? emailMatch[1].trim() : null;
  const strippedCommands = text
    .replace(/\[(ENCERRAR|FIM|OPTOUT|TRANSFERIR_HUMANO|SOLICITAR_CALLBACK_HUMANO)\]/gi, "")
    .replace(/\[REGISTRAR_EMAIL:[^\]]+\]/gi, "")
    .trim();
  return {
    text: stripOpeningFiller(strippedCommands),
    shouldEndCall,
    isOptOut,
    transferToHuman,
    callbackRequested,
    modelUsed,
    capturedEmail,
    promptUsed,
  };
}

async function callExternalBrain(
  turns: ConversationTurn[],
  prompt: string,
  context: ExternalBrainContext,
  cupomAtivo: boolean,
): Promise<AgentResponse | null> {
  const keys = await db.select().from(apiKeysTable).where(eq(apiKeysTable.isActive, true));
  const key = selectExternalBrainKey(keys);
  if (!key?.aiWebhookUrl) {
    const candidate = [...keys]
      .filter(row => !!row.aiWebhookUrl)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)[0];
    if (candidate) {
      try {
        await db.insert(apiKeyAuditLogsTable).values({
          apiKeyId: candidate.id,
          tokenPrefix: candidate.tokenPrefix,
          method: "POST",
          path: candidate.aiWebhookUrl!,
          scope: `hermes-call:${context.callId ?? "sem-callId"}:nenhuma chave elegível com discagem + brain + webhook`,
          statusCode: 422,
          durationMs: 0,
          sourceIp: "internal",
        });
      } catch (auditError) {
        logger.error({ auditError, callId: context.callId }, "Falha ao registrar roteamento não elegível do Hermes");
      }
    }
    logger.warn({ callId: context.callId }, "Hermes não acionado: nenhuma chave elegível com discagem + brain + webhook");
    return null;
  }

  const timestamp = String(Date.now());
  const lastUserText = turns.at(-1)?.text ?? "";
  const stage = inferHermesStage(turns);
  const body = JSON.stringify({
    event: "telephony.turn.requested",
    timestamp,
    context,
    callId: context.callId != null ? String(context.callId) : undefined,
    lead: {
      id: context.contactId ?? null,
      nome: context.contactName ?? null,
      empresa: context.companyName ?? null,
      cidade: context.city ?? null,
      estado: context.state ?? null,
      tipo: context.contactType ?? "contador",
      telefone: context.phoneNumber ?? null,
    },
    conversation: turns.map(turn => ({
      speaker: turn.role === "assistant" ? "agent" : "client",
      role: turn.role,
      text: turn.text,
      ts: turn.ts,
    })),
    stage,
    lastUserText,
    businessContext: {
      objetivo: "fechar parceria com contador",
      precoParceiro: "R$ 90,00",
      cadastroUrl: "https://lealcert.com.br/contadores",
      cupomAtivo,
      cupom: cupomAtivo ? "PARCEIRO" : null,
      primeiroCertificadoComCupom: cupomAtivo ? "R$ 70,00" : null,
    },
  });
  let auth: ReturnType<typeof createHermesWebhookAuth>;
  try {
    auth = createHermesWebhookAuth(body, key.aiWebhookKey, key.aiWebhookSecretEncrypted, timestamp);
  } catch (error) {
    logger.error({ error, keyId: key.id, callId: context.callId }, "Falha ao descriptografar credencial do Hermes");
    auth = null;
  }
  if (!auth) {
    try {
      await db.insert(apiKeyAuditLogsTable).values({
        apiKeyId: key.id,
        tokenPrefix: key.tokenPrefix,
        method: "POST",
        path: key.aiWebhookUrl,
        scope: `hermes-call:${context.callId ?? "sem-callId"}:${stage}:Webhook Key ou Webhook Secret do Hermes ausente ou inválido na chave.`,
        statusCode: 503,
        durationMs: 0,
        sourceIp: "internal",
      });
    } catch (auditError) {
      logger.error({ auditError, keyId: key.id, callId: context.callId }, "Falha ao registrar credenciais ausentes do Hermes");
    }
    logger.warn({ keyId: key.id, callId: context.callId }, "Hermes não acionado: credenciais HMAC do webhook ausentes ou inválidas");
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_500);
  const startedAt = Date.now();
  let attemptLogged = false;
  const logAttempt = async (statusCode: number, message: string): Promise<void> => {
    attemptLogged = true;
    try {
      await db.insert(apiKeyAuditLogsTable).values({
        apiKeyId: key.id,
        tokenPrefix: key.tokenPrefix,
        method: "POST",
        path: key.aiWebhookUrl!,
        scope: `hermes-call:${context.callId ?? "sem-callId"}:${stage}:${message.slice(0, 800)}`,
        statusCode,
        durationMs: Date.now() - startedAt,
        sourceIp: "internal",
      });
    } catch (auditError) {
      logger.error({ auditError, keyId: key.id, callId: context.callId }, "Falha ao salvar log de turno do Hermes");
    }
  };
  try {
    const response = await fetch(key.aiWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "LealCert/1.0",
        "X-LealCert-Key": auth.key,
        "X-LealCert-Timestamp": auth.timestamp,
        "X-LealCert-Signature": auth.signature,
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      const responseBody = (await response.text()).slice(0, 500);
      const message = `HTTP ${response.status}${responseBody ? `: ${responseBody}` : ""}`;
      await logAttempt(response.status, message);
      throw new Error(message);
    }
    const data = await response.json() as {
      text?: unknown;
      fala?: unknown;
      command?: unknown;
      shouldEnd?: unknown;
      shouldContinue?: unknown;
      statusSuggested?: unknown;
      endReason?: unknown;
    };
    const speech = typeof data.fala === "string" ? data.fala : data.text;
    if (typeof speech !== "string" || !speech.trim() || speech.length > 2_000) {
      throw new Error("Resposta sem texto válido");
    }
    const command = typeof data.command === "string" ? data.command.trim() : "";
    const shouldEnd = data.shouldEnd === true || data.shouldContinue === false;
    const commandSuffix = command || (shouldEnd ? "[ENCERRAR]" : "");
    const result = parseAgentText(`${speech.trim()} ${commandSuffix}`.trim(), lastUserText, "external", prompt);
    const statusSuggested = typeof data.statusSuggested === "string"
      ? data.statusSuggested.trim().toLowerCase()
      : "";
    result.interestStatus = /^(interessado|interested|com_interesse)$/.test(statusSuggested)
      ? "interested"
      : /^(sem_interesse|not_interested|desinteressado)$/.test(statusSuggested)
        ? "not_interested"
        : "unknown";
    result.endReason = typeof data.endReason === "string" && data.endReason.trim()
      ? data.endReason.trim().slice(0, 1_000)
      : shouldEnd && statusSuggested
        ? statusSuggested.slice(0, 1_000)
        : null;
    await logAttempt(response.status, "Turno autenticado e respondido pelo Hermes.");
    logger.info({ keyId: key.id, callId: context.callId, stage }, "Hermes respondeu ao turno da ligação");
    return result;
  } catch (error) {
    if (!attemptLogged) {
      const message = error instanceof Error && error.name === "AbortError"
        ? "Timeout após 4,5 segundos."
        : error instanceof Error ? error.message : String(error);
      await logAttempt(502, message);
    }
    logger.warn({ error, keyId: key.id, callId: context.callId }, "Hermes indisponível; usando IA interna como fallback");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Entrada principal com fallback ───────────────────────────────
export async function runAgentTurn(
  turns: ConversationTurn[],
  preferredModel: AiModel = "deepseek",
  agentName: string = "Willian",
  customSystemPrompt?: string,
  externalContext?: ExternalBrainContext,
  allowExternal = true,
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
      promptUsed: prompt,
    };
  }

  if (allowExternal && externalContext) {
    const fallbackEnabled = await isHermesFallbackEnabled();
    const externalResponse = await callExternalBrain(turns, prompt, externalContext, cupomAtivo);
    if (externalResponse) return externalResponse;
    if (!fallbackEnabled) {
      const error = new Error("Hermes indisponível e fallback interno desativado.");
      (error as Error & { hermesOnly?: boolean }).hermesOnly = true;
      throw error;
    }
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

      return parseAgentText(text, lastUserText, model, prompt);

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
