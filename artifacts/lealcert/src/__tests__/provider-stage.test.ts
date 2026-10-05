import { providerStageLabel } from "../lib/provider-stage";

const order = { status: "aguardando_validacao", garStatus: null, safewebStatus: null, garSyncedAt: null, safewebSyncedAt: null };

describe("Etapa real do provedor sem alterar o estado operacional", () => {
  it.each([
    ["Aguardando validação", "Aguardando validação"],
    ["Atendimento realizado", "Atendimento realizado"],
    ["Validada", "Validação concluída"],
    ["Aguardando emissão", "Aguardando emissão"],
    ["Em emissão", "Em emissão"],
    ["Uma nova etapa do provedor", "Uma nova etapa do provedor"],
  ])("mostra GAR %s com pedido ainda aguardando validação", (status, label) => {
    expect(providerStageLabel({ ...order, garStatus: status })).toBe(label);
  });
  it("Safeweb Validada deixa de aparecer como aguardando validação", () => {
    expect(providerStageLabel({ ...order, safewebStatus: "Validada" })).toBe("Validação concluída");
    expect(order.status).toBe("aguardando_validacao");
  });
  it("não trata evento de validação como aprovação ou atendimento", () => {
    expect(providerStageLabel({ ...order, safewebStatus: "validacao" })).toBe("Evento de validação recebido");
    expect(providerStageLabel({ ...order, safewebStatus: "verificacao (status 2)" }))
      .toBe("Evento de verificação recebido (status 2)");
  });
  it.each(["created", "pending_payment", "completed", "emitido", "cancelled", "revogado"])(
    "preserva o status principal %s mesmo com etapa antiga", status => {
      expect(providerStageLabel({ ...order, status, garStatus: "Aguardando emissão" })).toBeNull();
    },
  );
  it("não decide fase pelo horário agendado nem inventa etapas sem resposta", () => {
    expect(providerStageLabel(order)).toBeNull();
    expect(providerStageLabel({ ...order, safewebStatus: "2" })).toBe("Status do provedor: 2");
  });
  it("usa a atualização mais recente quando há dados dos dois provedores", () => {
    expect(providerStageLabel({
      ...order, garStatus: "Aguardando emissão", safewebStatus: "Validada",
      garSyncedAt: "2026-10-05T15:00:00Z", safewebSyncedAt: "2026-10-05T14:00:00Z",
    })).toBe("Aguardando emissão");
  });
});
