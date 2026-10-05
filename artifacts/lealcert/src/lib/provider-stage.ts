import type { Order } from "@workspace/api-client-react";

const NO_PROVIDER_STAGE = new Set(["created", "pending_payment", "completed", "emitido", "cancelled", "revogado"]);

/** A fase recebida não altera o estado operacional usado em pagamento, emissão e benefícios. */
export function providerStageLabel(order: Pick<Order,
  "status" | "garStatus" | "safewebStatus" | "garSyncedAt" | "safewebSyncedAt"
>): string | null {
  if (NO_PROVIDER_STAGE.has(order.status)) return null;
  const gar = order.garStatus?.trim();
  const safeweb = order.safewebStatus?.trim();
  const raw = gar && safeweb
    ? (new Date(order.safewebSyncedAt ?? 0).getTime() >= new Date(order.garSyncedAt ?? 0).getTime() ? safeweb : gar)
    : safeweb || gar;
  if (!raw) return null;
  const key = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_-]/g, " ").trim();
  const labels: Record<string, string> = {
    "aguardando validacao": "Aguardando validação",
    "em validacao": "Em validação",
    "em verificacao": "Em verificação",
    "validada": "Validação concluída",
    "validado": "Validação concluída",
    "aprovada": "Aprovada pelo provedor",
    "aprovado": "Aprovado pelo provedor",
    "aguardando emissao": "Aguardando emissão",
    "emissao pendente": "Aguardando emissão",
    "em emissao": "Em emissão",
    "aguardando atendimento": "Aguardando atendimento",
    "em atendimento": "Em atendimento",
    "atendido": "Atendimento realizado",
    "atendida": "Atendimento realizado",
    "atendimento realizado": "Atendimento realizado",
    "validacao": "Evento de validação recebido",
    "validacao autonoma": "Evento de validação autônoma recebido",
    "verificacao": "Evento de verificação recebido",
  };
  if (/^(validacao|validacao autonoma|verificacao) \(status \d+\)$/.test(key)) {
    const event = key.split(" (status ")[0];
    return `${labels[event]} ${raw.slice(raw.lastIndexOf("("))}`;
  }
  // Etapas desconhecidas continuam visíveis, exatamente como o provedor informou.
  return labels[key] ?? (/^\d+$/.test(raw) ? `Status do provedor: ${raw}` : raw);
}
