import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  order: { id: 800, safewebSolicitacaoId: "PROTO-800", safewebAgendamentoId: "manual-123", safewebStatus: "Validada" },
  updates: [] as Record<string, unknown>[],
  info: vi.fn(),
  event: vi.fn(),
}));
vi.mock("@workspace/db", async () => {
  const schema = await import("../../../../lib/db/src/schema/index");
  return { ...schema, db: {
    select: () => {
      let table: unknown;
      const chain = {
        from: (value: unknown) => { table = value; return chain; },
        where: () => chain, limit: () => chain,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(
          table === schema.ordersTable ? [state.order] : [{
            safewebUsername: "test-user", safewebPassword: "test-password", safewebUrl: "https://example.test",
          }],
        ).then(resolve),
      };
      return chain;
    },
    update: () => ({ set: (values: Record<string, unknown>) => {
      state.updates.push(values);
      return { where: async () => {} };
    } }),
  } };
});
vi.mock("../lib/safeweb", () => ({ swAgendaInformacoes: state.info }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../lib/order-events", () => ({ logEvent: state.event }));
import { swSyncStatus } from "../lib/sw-auto";

describe("Sincronização Safeweb preserva etapas e consulta o protocolo correto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.updates.length = 0;
    state.order.safewebStatus = "Validada";
  });
  it("usa protocolo mesmo com ID manual e registra espera de emissão", async () => {
    state.info.mockResolvedValueOnce({ Situacao: "Aguardando emissão" });
    expect(await swSyncStatus(800)).toMatchObject({ ok: true, status: "Aguardando emissão" });
    expect(state.info).toHaveBeenCalledWith(expect.anything(), "PROTO-800");
    expect(state.updates).toContainEqual(expect.objectContaining({ safewebStatus: "Aguardando emissão" }));
    expect(state.event).toHaveBeenCalledOnce();
    expect(state.updates.every(update => update.status === undefined)).toBe(true);
  });
  it("uma consulta sem etapa preserva dados e não registra sincronização fictícia", async () => {
    state.info.mockResolvedValueOnce({ statusId: 1, dataHoraInicio: "2026-10-05T15:00:00" });
    expect(await swSyncStatus(800)).toMatchObject({ ok: false, status: "Validada" });
    expect(state.updates).toHaveLength(0);
    expect(state.event).not.toHaveBeenCalled();
  });
  it("falha de rede não modifica nem conclui o pedido", async () => {
    state.info.mockRejectedValueOnce(new Error("Falha de teste"));
    expect(await swSyncStatus(800)).toMatchObject({ ok: false });
    expect(state.updates).toHaveLength(0);
    expect(state.event).not.toHaveBeenCalled();
  });
  it("consulta repetida atualiza a data mas não duplica eventos", async () => {
    state.info.mockResolvedValueOnce({ Status: "Validada" });
    expect(await swSyncStatus(800)).toMatchObject({ ok: true, status: "Validada" });
    expect(state.updates).toContainEqual(expect.objectContaining({ safewebSyncedAt: expect.any(Date) }));
    expect(state.event).not.toHaveBeenCalled();
  });
});
