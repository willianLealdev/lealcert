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
  if (!rawPhone || rawPhone.length < 8) {
    throw new Error(`Telefone inválido: "${phone}"`);
  }

  const e164 = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;
  const url = `${settings.evolutionUrl.replace(/\/$/, "")}/message/sendText/${settings.evolutionInstance}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
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
