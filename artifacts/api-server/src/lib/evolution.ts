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
    throw new Error(`Telefone inválido ou muito curto: "${phone}"`);
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
    throw new Error(`Não foi possível conectar à Evolution API (${url}): ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
  }

  const bodyText = await resp.text().catch(() => "");

  if (!resp.ok) {
    throw new Error(`Evolution API ${resp.status}: ${bodyText}`);
  }

  // Parse response to detect silent errors (Evolution sometimes returns 200 with error body)
  let bodyJson: unknown;
  try { bodyJson = JSON.parse(bodyText); } catch { bodyJson = null; }

  if (bodyJson && typeof bodyJson === "object" && bodyJson !== null) {
    const b = bodyJson as Record<string, unknown>;
    if (b.error || b.message === "error" || b.status === "error") {
      throw new Error(`Evolution API retornou erro: ${bodyText}`);
    }
  }

  logger.info({ phone: e164, instance: settings.evolutionInstance, status: resp.status, body: bodyText.slice(0, 300) }, "WhatsApp enviado via Evolution API");
}
