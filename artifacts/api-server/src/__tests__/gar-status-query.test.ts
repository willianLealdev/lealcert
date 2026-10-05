import { afterEach, describe, expect, it, vi } from "vitest";
import { garConsultarStatus } from "../lib/gestaoar";

afterEach(() => vi.unstubAllGlobals());

describe("Consulta GAR usa o identificador documentado, sem inventar a etapa", () => {
  function response(payload: unknown) {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", mock);
    return mock;
  }
  it("consulta pelo protocolo conhecido, deixando Pedido vazio", async () => {
    const fetch = response({ Status: 0, StatusPedido: "Aguardando Validação", Protocolo: "PROTO-TEST" });
    const actual = await garConsultarStatus("test-key", "PED-TEST", "PROTO-TEST");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      apiKey: "test-key", Pedido: "", Protocolo: "PROTO-TEST",
    });
    expect(actual.StatusPedido).toBe("Aguardando Validação");
  });
  it("antes da geração do protocolo mantém consulta pelo pedido", async () => {
    const fetch = response({ Status: 0, StatusPedido: "Compra registrada" });
    await garConsultarStatus("test-key", "PED-TEST");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      apiKey: "test-key", Pedido: "PED-TEST", Protocolo: "",
    });
  });
  it("protocolo em branco não apaga o identificador do pedido", async () => {
    const fetch = response({ StatusPedido: "Protocolo Gerado" });
    await garConsultarStatus("test-key", "PED-TEST", " ");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ Pedido: "PED-TEST", Protocolo: "" });
  });
  it.each([
    { Status: 9, Erros: [{ Ocorrencia: "Teste" }] },
    { Erros: [{ Ocorrencia: "Teste" }] },
    null,
  ])("HTTP 200 com erro da GAR não confirma uma consulta", async payload => {
    response(payload);
    await expect(garConsultarStatus("test-key", "PED-TEST", "PROTO-TEST"))
      .rejects.toThrow("não confirmou");
  });
  it("não reescreve a resposta do provedor para fingir uma etapa posterior", async () => {
    response({ Status: 0, StatusPedido: "Protocolo Gerado" });
    expect((await garConsultarStatus("test-key", "PED-TEST", "PROTO-TEST")).StatusPedido)
      .toBe("Protocolo Gerado");
  });
});
