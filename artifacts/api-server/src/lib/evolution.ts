import { logger } from "./logger";

export interface EvolutionSettings {
  evolutionUrl: string;
  evolutionApiKey: string;
  evolutionInstance: string;
}

function toE164(phone: string): string {
  const raw = phone.replace(/\D/g, "");
  return raw.startsWith("55") ? raw : `55${raw}`;
}

/**
 * Verifica se um número possui WhatsApp (regular ou Business).
 * Retorna true se o número está ativo no WhatsApp, false caso contrário.
 */
const EVOLUTION_TIMEOUT_MS = 20_000; // 20s — mata conexões travadas

function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), EVOLUTION_TIMEOUT_MS);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

export async function checkHasWhatsApp(
  settings: EvolutionSettings,
  phone: string,
): Promise<boolean> {
  const raw = phone.replace(/\D/g, "");
  if (!raw || raw.length < 8) return false;

  const e164 = toE164(phone);
  const url = `${settings.evolutionUrl.replace(/\/$/, "")}/chat/whatsappNumbers/${settings.evolutionInstance}`;

  try {
    const resp = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": settings.evolutionApiKey,
      },
      body: JSON.stringify({ numbers: [e164] }),
    });

    if (!resp.ok) {
      logger.warn({ phone: e164, status: resp.status }, "checkHasWhatsApp: resposta não-ok — assumindo que tem WhatsApp");
      return true; // em caso de falha na checagem, tenta enviar mesmo assim
    }

    const data = await resp.json() as Array<{ exists?: boolean; jid?: string; numberExists?: boolean }>;
    if (!Array.isArray(data) || data.length === 0) return true;

    const result = data[0];
    const exists = result.exists ?? result.numberExists ?? true;

    logger.info({ phone: e164, exists }, "checkHasWhatsApp: resultado");
    return exists;
  } catch (err) {
    logger.warn({ phone: e164, err }, "checkHasWhatsApp: erro na verificação — assumindo que tem WhatsApp");
    return true; // falha silenciosa — não bloqueia o envio
  }
}

export async function sendWhatsApp(
  settings: EvolutionSettings,
  phone: string,
  text: string,
): Promise<void> {
  const rawPhone = phone.replace(/\D/g, "");
  if (!rawPhone || rawPhone.length < 8) {
    throw new Error(`Telefone inválido: "${phone}"`);
  }

  const e164 = toE164(phone);
  const url = `${settings.evolutionUrl.replace(/\/$/, "")}/message/sendText/${settings.evolutionInstance}`;

  let resp: Response;
  try {
    resp = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": settings.evolutionApiKey,
      },
      body: JSON.stringify({ number: e164, text }),
    });
  } catch (fetchErr) {
    throw new Error(`Falha ao conectar na Evolution API: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
  }

  const bodyText = await resp.text().catch(() => "");

  if (!resp.ok) {
    throw new Error(`Evolution API ${resp.status}: ${bodyText}`);
  }

  logger.info({ phone: e164, instance: settings.evolutionInstance, responseBody: bodyText.slice(0, 400) }, "WhatsApp enviado via Evolution API");
}
