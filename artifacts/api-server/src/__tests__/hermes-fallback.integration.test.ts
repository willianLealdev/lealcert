import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  internalText: "Resposta segura da IA interna.",
  loggerWarn: vi.fn(),
  synthesize: vi.fn(async () => ({ id: "tts-1" })),
  audioUrl: vi.fn(async () => "https://audio.test/tts-1.mp3"),
}));

const hermesKey = {
  id: 41,
  isActive: true,
  revokedAt: null,
  expiresAt: null,
  scopes: ["discagem"],
  telephonyCapabilities: ["brain"],
  aiWebhookUrl: "https://hermes.test/turn",
  tokenHash: "hermes-signing-secret",
  tokenPrefix: "lc_live_hermes",
  createdAt: new Date("2026-09-10T00:00:00.000Z"),
};

vi.mock("@workspace/db", () => {
  const couponsTable = { kind: "coupons", active: "active", code: "code" };
  const apiKeysTable = { kind: "api-keys", isActive: "isActive" };

  function queryFor(table: unknown) {
    const rows = table === apiKeysTable ? [hermesKey] : [];
    const query = {
      where: () => query,
      limit: (count: number) => Promise.resolve(rows.slice(0, count)),
      then: (
        resolve?: (value: typeof rows) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(rows).then(resolve, reject),
    };
    return query;
  }

  return {
    db: { select: vi.fn(() => ({ from: (table: unknown) => queryFor(table) })) },
    couponsTable,
    apiKeysTable,
  };
});

vi.mock("../lib/discagem/settings-reader", () => ({
  getDiscagemSettings: vi.fn(async () => ({
    aiFallback: ["deepseek"],
    deepseekApiKey: "internal-key",
    deepseekModel: "deepseek-chat",
    claudeApiKey: "",
    claudeModel: "",
    openaiApiKey: "",
    openaiModel: "",
  })),
}));

vi.mock("../lib/discagem/site-cache", () => ({
  getSiteCacheBlock: vi.fn(() => ""),
  refreshSiteCache: vi.fn(async () => undefined),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: mocks.loggerWarn, error: vi.fn() },
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content: mocks.internalText } }],
        })),
      },
    };
  },
}));

vi.mock("../lib/discagem/tts", () => ({
  synthesize: mocks.synthesize,
  audioUrl: mocks.audioUrl,
}));

vi.mock("../lib/discagem/opening-pregenerate", () => ({
  resolveVoiceId: vi.fn(async () => "voice-1"),
}));

import {
  conversationCache,
  pendingResults,
  processSpeechTurn,
} from "../lib/discagem/conversation-state";

type WebhookRequest = {
  event: string;
  timestamp: string;
  context: Record<string, unknown>;
  conversation: Array<{ role: string; text: string; ts: string }>;
  systemPrompt: string;
};

function validateHermesRequest(input: string | URL | Request, init?: RequestInit): WebhookRequest {
  expect(String(input)).toBe(hermesKey.aiWebhookUrl);
  expect(init?.method).toBe("POST");

  const headers = new Headers(init?.headers);
  const body = String(init?.body);
  const timestamp = headers.get("X-LealCert-Timestamp");
  const expectedSignature = createHmac("sha256", hermesKey.tokenHash)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");

  expect(headers.get("X-LealCert-Key")).toBe(hermesKey.tokenPrefix);
  expect(headers.get("X-LealCert-Signature")).toBe(`sha256=${expectedSignature}`);

  const payload = JSON.parse(body) as WebhookRequest;
  expect(payload.event).toBe("telephony.turn.requested");
  expect(payload.timestamp).toBe(timestamp);
  expect(payload.context).toMatchObject({
    callId: expect.any(Number),
    campaignId: 12,
    contactId: 34,
    phoneNumber: "+5511999999999",
    contactName: "Cliente Teste",
  });
  expect(payload.conversation).toEqual([
    expect.objectContaining({ role: "user", text: "Quero saber mais." }),
  ]);
  expect(payload.systemPrompt).toContain("Prompt de integração");
  return payload;
}

async function runPipeline(callId: number) {
  processSpeechTurn(
    callId,
    {
      id: 12,
      contactId: 34,
      phoneNumber: "+5511999999999",
      contactName: "Cliente Teste",
      aiModel: "deepseek",
      agentName: "Willian",
      ttsProvider: "elevenlabs",
      systemPrompt: "Prompt de integração para {AGENT_NAME}.",
    } as Parameters<typeof processSpeechTurn>[1],
    "Quero saber mais.",
  );

  const pending = pendingResults.get(callId);
  expect(pending).toBeDefined();
  return pending!.promise;
}

describe("Hermes integrado ao pipeline de ligação", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    conversationCache.clear();
    pendingResults.clear();
    mocks.loggerWarn.mockClear();
    mocks.synthesize.mockClear();
    mocks.audioUrl.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("usa a resposta válida do Hermes e envia contexto, histórico, prompt e assinatura HMAC", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      validateHermesRequest(input, init);
      return new Response(JSON.stringify({ text: "Próxima fala criada pelo Hermes." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const result = await runPipeline(101);

    expect(result.err).toBeUndefined();
    expect(result.shouldEndCall).toBe(false);
    expect(result.aiSource).toBe("external");
    expect(result.audioUrl).toBe("https://audio.test/tts-1.mp3");
    expect(result.history.at(-1)?.text).toBe("Próxima fala criada pelo Hermes.");
    expect(mocks.synthesize).toHaveBeenCalledWith(
      "Próxima fala criada pelo Hermes.",
      "elevenlabs",
      "voice-1",
    );
  });

  it.each([
    {
      name: "HTTP 500",
      response: () => Promise.resolve(new Response("erro", { status: 500 })),
    },
    {
      name: "JSON inválido",
      response: () => Promise.resolve(new Response("{inválido", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })),
    },
  ])("usa a IA interna e mantém a ligação ativa quando o Hermes retorna $name", async ({ response }) => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      validateHermesRequest(input, init);
      return response();
    }));

    const result = await runPipeline(102);

    expect(result.err).toBeUndefined();
    expect(result.shouldEndCall).toBe(false);
    expect(result.aiSource).toBe("deepseek");
    expect(result.audioUrl).toBe("https://audio.test/tts-1.mp3");
    expect(result.history.at(-1)?.text).toBe(mocks.internalText);
    expect(mocks.loggerWarn).toHaveBeenCalledOnce();
  });

  it("usa a IA interna e mantém a ligação ativa quando o Hermes excede o timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) => {
      validateHermesRequest(input, init);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    }));

    const resultPromise = runPipeline(103);
    await vi.advanceTimersByTimeAsync(4_500);
    const result = await resultPromise;

    expect(result.err).toBeUndefined();
    expect(result.shouldEndCall).toBe(false);
    expect(result.aiSource).toBe("deepseek");
    expect(result.audioUrl).toBe("https://audio.test/tts-1.mp3");
    expect(result.history.at(-1)?.text).toBe(mocks.internalText);
    expect(mocks.loggerWarn).toHaveBeenCalledOnce();
  });
});