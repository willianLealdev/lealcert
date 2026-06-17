import { logger } from "./logger";

export interface EvolutionSettings {
  evolutionUrl: string;
  evolutionApiKey: string;
  evolutionInstance: string;
}

export async function sendWhatsApp(
  settings: EvolutionSettings,
  phone: string,
  text: string,
): Promise<void> {
  const rawPhone = phone.replace(/\D/g, "");
  if (!rawPhone || rawPhone.length < 10) {
    logger.warn({ phone }, "sendWhatsApp: telefone inválido ou muito curto — ignorando");
    return;
  }

  const e164 = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;
  const url = `${settings.evolutionUrl.replace(/\/$/, "")}/message/sendText/${settings.evolutionInstance}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": settings.evolutionApiKey,
    },
    body: JSON.stringify({ number: e164, text }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Evolution API ${resp.status}: ${body}`);
  }

  logger.info({ phone: e164 }, "WhatsApp enviado via Evolution API");
}
