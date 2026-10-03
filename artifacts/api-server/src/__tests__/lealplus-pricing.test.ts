import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const state = vi.hoisted(() => ({ price: "19.90", missing: false }));
vi.mock("@workspace/db", () => ({
  settingsTable: { lealPlusPrice: "price" },
  db: {
    select: () => ({ from: () => ({ limit: async () => state.missing ? [] : [{ price: state.price }] }) }),
  },
}));
import { calculateOrderTotal, getLealPlusPrice, moneyCents } from "../lib/lealplus-pricing";

describe("Leal Plus: preço único no backend", () => {
  beforeEach(() => { state.price = "19.90"; state.missing = false; });
  it("cobra R$ 109,90 por certificado de R$ 90,00 com Leal Plus de R$ 19,90", async () => {
    expect(calculateOrderTotal(90, await getLealPlusPrice())).toBe(109.9);
  });
  it("usa alteração do banco imediatamente, sem cache ou preço local", async () => {
    expect(await getLealPlusPrice()).toBe(19.9);
    state.price = "29.90";
    expect(calculateOrderTotal(90, await getLealPlusPrice())).toBe(119.9);
  });
  it("sem Leal Plus cobra somente o certificado", () => {
    expect(calculateOrderTotal(90, 0)).toBe(90);
  });
  it("calcula em centavos e mantém desconto explícito", () => {
    expect(calculateOrderTotal(90, 19.9, 10)).toBe(99.9);
    expect(calculateOrderTotal(0.1, 0.2)).toBe(0.3);
  });
  it.each([-1, "abc", undefined, null, "19.999", Infinity])("rejeita preço inválido %s", value => {
    expect(() => moneyCents(value)).toThrow();
  });
  it("não concede preço zero se não existir configuração", async () => {
    state.missing = true;
    await expect(getLealPlusPrice()).rejects.toThrow("não configurado");
  });
  it.each(["orders.ts", "checkout.ts", "chat.ts"])("a rota %s lê o banco e preserva o preço no pedido", file => {
    const source = readFileSync(new URL(`../routes/${file}`, import.meta.url), "utf8");
    expect(source).toContain("await getLealPlusPrice()");
    expect(source).toContain("calculateOrderTotal(basePrice,");
    expect(source).toMatch(/lealPlusPrice: leal[Pp]lusPrice.toFixed\(2\)/);
    expect(source).not.toMatch(/extendedWarranty\s*\?\s*(?:15|19\.9)/);
  });
});