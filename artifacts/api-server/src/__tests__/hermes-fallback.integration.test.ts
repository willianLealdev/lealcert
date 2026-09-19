import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  internalText: "Resposta segura da IA interna.",
  internalError: false,
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
  aiWebhookKey: "hermes-webhook-key",
  aiWebhookSecretEncrypted: null as string | null,
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
          choices: mocks.internalError
            ? (() => { throw new Error("IA interna indisponível"); })()
            : [{ message: { content: mocks.internalText } }],
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
import { runAgentTurn } from "../lib/discagem/ai-agent";
import { encryptHermesWebhookSecret } from "../lib/api-keys";

type WebhookRequest = {
  event: string;
  timestamp: string;
  context: Record<string, unknown>;
  callId: string;
  lead: { id: number; nome: string; tipo: string; telefone: string };
  conversation: Array<{ speaker: string; role: string; text: string; ts: string }>;
  stage: string;
  lastUserText: string;
  businessContext: {
    objetivo: string;
    precoParceiro: string;
    cadastroUrl: string;
    cupomAtivo: boolean;
    cupom: string | null;
  };
  systemPrompt?: string;
};

function validateHermesRequest(input: string | URL | Request, init?: RequestInit): WebhookRequest {
  expect(String(input)).toBe(hermesKey.aiWebhookUrl);
  expect(init?.method).toBe("POST");

  const headers = new Headers(init?.headers);
  const body = String(init?.body);
  const timestamp = headers.get("X-LealCert-Timestamp");
  const expectedSignature = createHmac("sha256", "hermes-webhook-secret")
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");

  expect(headers.get("User-Agent")).toBe("LealCert/1.0");
  expect(headers.get("X-LealCert-Key")).toBe(hermesKey.aiWebhookKey);
  expect(headers.get("X-LealCert-Signature")).toBe(expectedSignature);

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
  expect(payload.callId).toMatch(/^\d+$/);
  expect(payload.lead).toMatchObject({
    id: 34,
    nome: "Cliente Teste",
    tipo: "contador",
    telefone: "+5511999999999",
  });
  expect(payload.conversation).toEqual([
    expect.objectContaining({ speaker: "client", role: "user" }),
  ]);
  expect(payload.businessContext).toMatchObject({
    objetivo: "fechar parceria com contador",
    precoParceiro: "R$ 90,00",
    cadastroUrl: "https://lealcert.com.br/contadores",
    cupomAtivo: false,
    cupom: null,
  });
  expect(payload.systemPrompt).toBeUndefined();
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
    mocks.internalError = false;
    process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
    hermesKey.aiWebhookSecretEncrypted = encryptHermesWebhookSecret("hermes-webhook-secret");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("usa a resposta válida do Hermes e envia contexto, histórico e assinatura HMAC sem o prompt antigo", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const payload = validateHermesRequest(input, init);
      expect(payload.stage).toBe("opening");
      expect(payload.lastUserText).toBe("Quero saber mais.");
      expect(payload.conversation[0]?.text).toBe("Quero saber mais.");
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

  it("aceita o contrato síncrono do Hermes com fala, estágio e comando de encerramento", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      validateHermesRequest(input, init);
      return new Response(JSON.stringify({
        fala: "Sem problema, agradeço sua atenção. Tenha um ótimo dia.",
        stage: "encerramento",
        statusSuggested: "sem_interesse",
        shouldContinue: false,
        shouldEnd: true,
        command: "[ENCERRAR]",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const result = await runPipeline(104);

    expect(result.err).toBeUndefined();
    expect(result.shouldEndCall).toBe(true);
    expect(result.aiSource).toBe("external");
    expect(result.interestStatus).toBe("not_interested");
    expect(result.endReason).toBe("sem_interesse");
    expect(result.history.at(-1)?.text).toBe("Sem problema, agradeço sua atenção. Tenha um ótimo dia.");
  });

  it("usa o Hermes também para criar a abertura inicial da ligação", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const payload = validateHermesRequest(input, init);
      expect(payload.stage).toBe("opening");
      expect(payload.lastUserText).toBe("[INÍCIO DA LIGAÇÃO]");
      expect(payload.conversation).toEqual([
        expect.objectContaining({
          speaker: "client",
          role: "user",
          text: "[INÍCIO DA LIGAÇÃO]",
        }),
      ]);
      return new Response(JSON.stringify({
        fala: "Bom dia, aqui é o Willian da Leal Cert. Com quem eu falo?",
        shouldContinue: true,
        shouldEnd: false,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const result = await runAgentTurn(
      [{ role: "user", text: "[INÍCIO DA LIGAÇÃO]", ts: new Date().toISOString() }],
      "deepseek",
      "Willian",
      "Prompt de integração para {AGENT_NAME}.",
      {
        callId: 105,
        campaignId: 12,
        contactId: 34,
        phoneNumber: "+5511999999999",
        contactName: "Cliente Teste",
      },
    );

    expect(result.modelUsed).toBe("external");
    expect(result.text).toBe("Bom dia, aqui é o Willian da Leal Cert. Com quem eu falo?");
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

  it("mantém a ligação ativa com mensagem de emergência se Hermes e IA interna falharem", async () => {
    mocks.internalError = true;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      validateHermesRequest(input, init);
      return new Response("erro", { status: 500 });
    }));

    const result = await runPipeline(106);

    expect(result.err).toBeUndefined();
    expect(result.shouldEndCall).toBe(false);
    expect(result.aiSource).toBe("emergency");
    expect(result.audioUrl).toBe("https://audio.test/tts-1.mp3");
    expect(result.history.at(-1)?.text).toBe("Desculpe, tive uma instabilidade. Pode repetir, por favor?");
  });
});