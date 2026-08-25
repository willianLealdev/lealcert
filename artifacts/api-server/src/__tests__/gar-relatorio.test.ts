import { describe, expect, it } from "vitest";
import {
  enrichGarParceiroVendasWithLocalOrders,
  getGarParceiroVendasPedidoIdentifier,
  normalizeGarPedidoIdentifier,
} from "../lib/gestaoar";

describe("Relatório GAR — cruzamento de pedidos", () => {
  it.each([
    [46234, "46234"],
    ["46234", "46234"],
    [" 0046234 ", "46234"],
    ["000", "0"],
    [null, null],
    ["", null],
    ["46234-A", null],
  ])("normaliza %j como %j", (value, expected) => {
    expect(normalizeGarPedidoIdentifier(value)).toBe(expected);
  });

  it("usa somente o Id da venda, nunca protocolo ou hash", () => {
    expect(getGarParceiroVendasPedidoIdentifier({
      Id: undefined,
      Protocolo: "46234",
      HashLancamento: "46234",
    })).toBeNull();
  });

  it("associa Id GAR numérico ao garPedido textual com espaços e zeros", () => {
    const [matched, notFound] = enrichGarParceiroVendasWithLocalOrders(
      [
        { Id: 46234, Protocolo: "PROTOCOLO-DIFERENTE", HashLancamento: "HASH-DIFERENTE" },
        { Id: 77777 },
      ],
      [
        { id: 101, orderNumber: "20260821-3570", garPedido: " 00046234 " },
      ],
    );

    expect(matched.localOrderId).toBe(101);
    expect(matched.localOrderNumber).toBe("20260821-3570");
    expect(notFound.localOrderId).toBeNull();
    expect(notFound.localOrderNumber).toBeNull();
  });

  it("não associa venda sem Id usando protocolo ou hash", () => {
    const [result] = enrichGarParceiroVendasWithLocalOrders(
      [{ Protocolo: "46234", HashLancamento: "hash-46234" }],
      [{ id: 101, orderNumber: "20260821-3570", garPedido: "46234" }],
    );

    expect(result.localOrderId).toBeNull();
  });

  it("não escolhe um pedido arbitrariamente quando a normalização colide", () => {
    const [result] = enrichGarParceiroVendasWithLocalOrders(
      [{ Id: "46234" }],
      [
        { id: 101, orderNumber: "20260821-3570", garPedido: "46234" },
        { id: 202, orderNumber: "20260822-9999", garPedido: "00046234" },
      ],
    );

    expect(result.localOrderId).toBeNull();
  });
});