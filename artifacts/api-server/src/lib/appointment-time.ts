/**
 * Datas sem fuso recebidas de GAR/Safeweb são horários de Brasília,
 * nunca horários locais da VPS. Timestamps com fuso explícito são preservados.
 */
export function parseAppointmentTime(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let text = value.trim();
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}:\d{2}(?::\d{2})?)$/);
  if (br) text = `${br[3]}-${br[2]}-${br[1]}T${br[4]}`;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/i);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00", fraction = "", offset] = match;
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() !== Number(month) - 1 ||
      calendar.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}${offset ?? "-03:00"}`);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function orderAppointmentTime(order: {
  safewebAgendamentoDataHora?: string | null;
  garAgendamentoDataHora?: string | null;
  scheduledAt?: Date | string | null;
}): Date | null {
  // O horário do provedor corrige a leitura de pedidos antigos salvos sem fuso,
  // sem alterar dados históricos no banco.
  const providerDate = parseAppointmentTime(order.safewebAgendamentoDataHora) ??
    parseAppointmentTime(order.garAgendamentoDataHora);
  if (providerDate) return providerDate;
  if (!order.scheduledAt) return null;
  const date = order.scheduledAt instanceof Date
    ? order.scheduledAt : parseAppointmentTime(order.scheduledAt);
  return date && Number.isFinite(date.getTime()) ? date : null;
}
