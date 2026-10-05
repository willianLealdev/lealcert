import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAppointmentTime, orderAppointmentTime } from "../lib/appointment-time";

afterEach(() => vi.unstubAllEnvs());

describe("Horário de Brasília na agenda GAR/Safeweb", () => {
  it.each(["UTC", "America/Sao_Paulo", "America/Los_Angeles"])(
    "15h Brasil vira 18h UTC independentemente de TZ=%s", zone => {
      vi.stubEnv("TZ", zone);
      expect(parseAppointmentTime("2026-10-05 15:00")?.toISOString()).toBe("2026-10-05T18:00:00.000Z");
      expect(parseAppointmentTime("2026-10-05T15:00:00")?.toISOString()).toBe("2026-10-05T18:00:00.000Z");
    },
  );

  it.each([
    ["05/10/2026 15:00", "2026-10-05T18:00:00.000Z"],
    ["05/10/2026 15:00:30", "2026-10-05T18:00:30.000Z"],
    ["2026-10-05T18:00:00Z", "2026-10-05T18:00:00.000Z"],
    ["2026-10-05T15:00:00-03:00", "2026-10-05T18:00:00.000Z"],
    ["2026-10-05T15:00:00.123-0300", "2026-10-05T18:00:00.123Z"],
  ])("interpreta %s sem deslocar o horário", (input, iso) => {
    expect(parseAppointmentTime(input)?.toISOString()).toBe(iso);
  });

  it.each([null, {}, "2026-02-30 15:00", "2026-10-05 25:00", "2026-10-05 15:61", "05/10/2026", "inválido"])(
    "não inventa agendamento para data inválida: %j", value => {
      expect(parseAppointmentTime(value)).toBeNull();
    },
  );

  it("lê corretamente GAR histórico salvo três horas antes na VPS", () => {
    const time = orderAppointmentTime({
      garAgendamentoDataHora: "2026-10-05 15:00",
      scheduledAt: new Date("2026-10-05T15:00:00Z"),
    })!;
    expect(time.toISOString()).toBe("2026-10-05T18:00:00.000Z");
    expect(time.getTime() > new Date("2026-10-05T17:59:59.999Z").getTime()).toBe(true);
    expect(time.getTime() > new Date("2026-10-05T18:00:00Z").getTime()).toBe(false);
  });

  it("inclui Safeweb sem scheduledAt e normaliza o horário antigo", () => {
    expect(orderAppointmentTime({
      safewebAgendamentoDataHora: "2026-10-05T15:00:00", scheduledAt: null,
    })?.toISOString()).toBe("2026-10-05T18:00:00.000Z");
    expect(orderAppointmentTime({
      safewebAgendamentoDataHora: "2026-10-05T15:00:00",
      scheduledAt: new Date("2026-10-05T15:00:00Z"),
    })?.toISOString()).toBe("2026-10-05T18:00:00.000Z");
  });

  it("preserva timestamp explícito dos agendamentos internos do chat", () => {
    expect(orderAppointmentTime({ scheduledAt: new Date("2026-10-05T18:00:00Z") })?.toISOString())
      .toBe("2026-10-05T18:00:00.000Z");
    expect(orderAppointmentTime({ scheduledAt: "2026-10-05T18:00:00Z" })?.toISOString())
      .toBe("2026-10-05T18:00:00.000Z");
  });

  it("sem horário válido não cria uma data atual fictícia", () => {
    expect(orderAppointmentTime({ garAgendamentoDataHora: "não definido", scheduledAt: null })).toBeNull();
  });
});
