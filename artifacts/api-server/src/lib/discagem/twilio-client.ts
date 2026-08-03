/**
 * Twilio — inicia chamadas outbound e gera TwiML.
 */

export interface OutboundCallOptions {
  to: string;
  callbackBaseUrl: string;  // ex: https://meusite.com/api/discagem
  callId: number;
  campaignId: number;
}

/** Inicia uma chamada outbound via Twilio REST API */
export async function initiateCall(opts: OutboundCallOptions): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    throw new Error("Credenciais Twilio não configuradas (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER)");
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
    RecordingStatusCallback: statusUrl,
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

    // Detecta crédito insuficiente
    if (res.status === 402 || (err?.code && [20003, 20005, 21211, 21212].includes(err.code))) {
      const e = new Error(`CREDIT_ERROR: Twilio — ${msg}`);
      (e as any).creditError = "TWILIO";
      throw e;
    }
    throw new Error(`Twilio initiateCall falhou: ${msg}`);
  }

  const data = await res.json() as any;
  return data.sid as string;
}

/** Encerra uma chamada em andamento */
export async function hangupCall(twilioSid: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
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

// ── TwiML builders ─────────────────────────────────────────────────
export function twimlResponse(twiml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${twiml}</Response>`;
}

/** TwiML inicial: fala a mensagem de abertura e abre Gather */
export function twimlOpeningGather(audioUrl: string, gatherAction: string): string {
  return twimlResponse(`
    <Play>${audioUrl}</Play>
    <Gather input="speech" action="${gatherAction}" method="POST"
      timeout="8" speechTimeout="auto" language="pt-BR">
    </Gather>
    <Redirect method="POST">${gatherAction}?hangup=1</Redirect>
  `);
}

/** TwiML de resposta: toca a resposta gerada e reabre Gather */
export function twimlReplyGather(audioUrl: string, gatherAction: string): string {
  return twimlResponse(`
    <Play>${audioUrl}</Play>
    <Gather input="speech" action="${gatherAction}" method="POST"
      timeout="8" speechTimeout="auto" language="pt-BR">
    </Gather>
    <Redirect method="POST">${gatherAction}?hangup=1</Redirect>
  `);
}

/** TwiML de encerramento */
export function twimlHangup(audioUrl?: string): string {
  if (audioUrl) {
    return twimlResponse(`<Play>${audioUrl}</Play><Hangup/>`);
  }
  return twimlResponse(`<Hangup/>`);
}

/** TwiML para caixa postal — encerra imediatamente */
export function twimlVoicemailHangup(): string {
  return twimlResponse(`<Hangup/>`);
}
