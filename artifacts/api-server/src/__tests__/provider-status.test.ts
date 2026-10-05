import { describe, expect, it } from "vitest";
import { safewebStatusLabel } from "../lib/provider-status";

describe("Status Safeweb informado pelo provedor", () => {
  it.each(["Status", "status", "Situacao", "situacao", "Evento", "evento"])(
    "preserva o campo %s", field => {
      expect(safewebStatusLabel({ [field]: "  Atendimento realizado  " })).toBe("Atendimento realizado");
    },
  );
  it("prioriza descrição real sobre código numérico sem documentação", () => {
    expect(safewebStatusLabel({ Status: 2, Situacao: "Aguardando emissão" }, "validacao"))
      .toBe("Aguardando emissão");
  });
  it("preserva código e tipo do evento sem inventar aprovação", () => {
    expect(safewebStatusLabel({ Status: 2 }, "verificacao")).toBe("verificacao (status 2)");
    expect(safewebStatusLabel({ status: 0 }, "validacao")).toBe("validacao (status 0)");
  });
  it("mantém evento recebido mesmo sem descrição adicional", () => {
    expect(safewebStatusLabel({}, "validacao")).toBe("validacao");
  });
  it("não transforma dados de agendamento em status do processo", () => {
    expect(safewebStatusLabel({ statusId: 1, dataHoraInicio: "2026-10-05T15:00:00" })).toBeNull();
  });
  it("sem resposta de etapa não inventa um status atualizado", () => {
    expect(safewebStatusLabel({})).toBeNull();
    expect(safewebStatusLabel({ Status: {} })).toBeNull();
  });
});
