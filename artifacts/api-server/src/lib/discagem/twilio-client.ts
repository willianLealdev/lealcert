/**
 * Twilio — lê credenciais do banco (Settings → Discagem),
 * com fallback para variáveis de ambiente.
 */

import { getDiscagemSettings } from "./settings-reader";

export interface OutboundCallOptions {
  to: string;
  callbackBaseUrl: string;
  callId: number;
  campaignId: number;
}

export async function initiateCall(opts: OutboundCallOptions): Promise<string> {
  const cfg = await getDiscagemSettings();
  const sid = cfg.twilioAccountSid;
  const token = cfg.twilioAuthToken;
  const from = cfg.twilioPhoneNumber;

  if (!sid || !token || !from) {
    throw new Error("Credenciais Twilio não configuradas. Acesse Configurações → Discagem para inserir Account SID, Auth Token e número.");
  }

  const voiceUrl = `${opts.callbackBaseUrl}/voice/${opts.callId}`;
  const statusUrl = `${opts.callbackBaseUrl}/status/${opts.callId}`;
  const amdUrl = `${opts.callbackBaseUrl}/amd/${opts.callId}`;

  const params = new URLSearchParams({
    To: opts.to,
    From: from,
    Url: voiceUrl,
    StatusCallback: statusUrl,
    StatusCallbackMethod: "POST",
    StatusCallbackEvent: "completed initiated ringing answered",
    MachineDetection: "Enable",
    AsyncAmdStatusCallback: amdUrl,
    AsyncAmdStatusCallbackMethod: "POST",
    Timeout: "30",
    Record: "true",
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    const msg = err?.message || `HTTP ${res.status}`;
    // Autenticação inválida (Account SID ou Auth Token errado)
    if (err?.code === 20003) {
      throw new Error(`Credenciais Twilio inválidas — verifique o Account SID e Auth Token em Configurações → Discagem. Twilio: ${msg}`);
    }
    // Conta desativada
    if (err?.code === 20005) {
      throw new Error(`Conta Twilio desativada. Twilio: ${msg}`);
    }
    // Crédito insuficiente
    if (res.status === 402) {
      const e = new Error(`CREDIT_ERROR: Twilio — ${msg}`);
      (e as any).creditError = "TWILIO";
      throw e;
    }
    // Número inválido (formato errado, sem código de país, etc.)
    if (err?.code && [21211, 21212].includes(err.code)) {
      throw new Error(`Número de telefone inválido — use o formato E.164 com código do país (ex: +5511999999999 ou +12025551234). Twilio: ${msg}`);
    }
    // Geo-permission bloqueada
    if (err?.code === 21215) {
      throw new Error(`País bloqueado no Twilio — acesse console.twilio.com → Voice → Geo Permissions e habilite o país de destino. Twilio: ${msg}`);
    }
    throw new Error(`Twilio initiateCall falhou: ${msg}`);
  }

  const data = await res.json() as any;
  return data.sid as string;
}

/** Busca a duração real de uma call via REST API do Twilio (em segundos) */
export async function fetchCallDuration(twilioSid: string): Promise<number> {
  const cfg = await getDiscagemSettings();
  const sid = cfg.twilioAccountSid;
  const token = cfg.twilioAuthToken;
  if (!sid || !token || !twilioSid) return 0;

  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${twilioSid}.json`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        },
      },
    );
    if (!resp.ok) return 0;
    const data = await resp.json() as { duration?: string };
    return parseInt(data.duration ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

export async function hangupCall(twilioSid: string): Promise<void> {
  const cfg = await getDiscagemSettings();
  const sid = cfg.twilioAccountSid;
  const token = cfg.twilioAuthToken;
  if (!sid || !token) return;

  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${twilioSid}.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ Status: "completed" }).toString(),
    },
  );
}

// ── TwiML builders ────────────────────────────────────────────────
export function twimlResponse(twiml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${twiml}</Response>`;
}

export function twimlOpeningGather(audioUrl: string, gatherAction: string): string {
  return twimlResponse(`
    <Play>${audioUrl}</Play>
    <Gather input="speech" action="${gatherAction}" method="POST"
      timeout="8" speechTimeout="1" language="pt-BR" speechModel="phone_call">
    </Gather>
    <Redirect method="POST">${gatherAction}?hangup=1</Redirect>
  `);
}

export function twimlReplyGather(audioUrl: string, gatherAction: string): string {
  return twimlResponse(`
    <Play>${audioUrl}</Play>
    <Gather input="speech" action="${gatherAction}" method="POST"
      timeout="8" speechTimeout="1" language="pt-BR" speechModel="phone_call">
    </Gather>
    <Redirect method="POST">${gatherAction}?hangup=1</Redirect>
  `);
}

/** TwiML de abertura com Media Streams (Deepgram STT) */
export function twimlOpeningStream(audioUrl: string, streamUrl: string): string {
  return twimlResponse(`
    <Play>${audioUrl}</Play>
    <Connect>
      <Stream url="${streamUrl}" />
    </Connect>
  `);
}

/** TwiML de reply com Media Streams — toca áudio e reconecta o stream */
export function twimlReplyStream(audioUrl: string, streamUrl: string): string {
  return twimlResponse(`
    <Play>${audioUrl}</Play>
    <Connect>
      <Stream url="${streamUrl}" />
    </Connect>
  `);
}

/** TwiML de filler enquanto a IA processa — redireciona para /reply */
export function twimlFillerRedirect(fillerUrl: string, replyUrl: string): string {
  return twimlResponse(`
    <Play>${fillerUrl}</Play>
    <Redirect method="POST">${replyUrl}</Redirect>
  `);
}

export function twimlHangup(audioUrl?: string): string {
  if (audioUrl) return twimlResponse(`<Play>${audioUrl}</Play><Hangup/>`);
  return twimlResponse(`<Hangup/>`);
}

export function twimlVoicemailHangup(): string {
  return twimlResponse(`<Hangup/>`);
}
