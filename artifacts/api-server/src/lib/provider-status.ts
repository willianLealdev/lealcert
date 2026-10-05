/** Extrai somente status realmente informado, sem confundir uma consulta com mudança de etapa. */
export function safewebStatusLabel(payload: Record<string, unknown>, eventType?: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return eventType ?? null;
  const values = [payload.Status, payload.status, payload.Situacao, payload.situacao, payload.Evento, payload.evento];
  const text = values.find(value => typeof value === "string" && value.trim() && !/^\d+$/.test(value.trim()));
  if (typeof text === "string") return text.trim();
  const code = values.find(value => typeof value === "number" ||
    (typeof value === "string" && /^\d+$/.test(value.trim())));
  if (eventType) return code === undefined ? eventType : `${eventType} (status ${code})`;
  return code === undefined ? null : String(code);
}
