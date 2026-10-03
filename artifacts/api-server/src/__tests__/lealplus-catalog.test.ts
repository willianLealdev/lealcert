import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";

const state = vi.hoisted(() => ({ price: "19.90" }));
vi.mock("@workspace/db", () => ({
  settingsTable: { id: "settings.id", lealPlusPrice: "settings.leal_plus_price" },
  usersTable: {}, certificatesTable: {}, ordersTable: {},
  db: {
    select: () => ({ from: () => ({ limit: async () => [{ id: 1, price: state.price }] }) }),
    update: () => ({
      set: (values: { lealPlusPrice: string }) => ({
        where: async () => { state.price = values.lealPlusPrice; },
      }),
    }),
  },
}));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../lib/safeweb", () => ({ swListarProdutos: vi.fn() }));
vi.mock("../lib/gestaoar", () => ({
  garTabelaPrecos: vi.fn(), garParceiroVendas: vi.fn(), garTiposProduto: vi.fn(), garTiposEmissao: vi.fn(),
}));
import catalogRouter from "../routes/certificates";

function app(role?: "admin" | "contador") {
  const server = express();
  server.use(express.json());
  server.use(session({ secret: "catalog-test", resave: false, saveUninitialized: false }));
  server.use((req, _res, next) => {
    if (role) { req.session.userId = 1; req.session.role = role; }
    req.log = { info: vi.fn() } as unknown as typeof req.log;
    next();
  });
  server.use("/api", catalogRouter);
  return server;
}

describe("Catálogo Leal Plus", () => {
  beforeEach(() => { state.price = "19.90"; });
  it("permite consultar preço para o checkout público sem expor configurações", async () => {
    const response = await request(app()).get("/api/catalog/lealplus");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ price: 19.9 });
    expect(response.headers["cache-control"]).toBe("no-store");
  });
  it("salva alteração e retorna o preço persistido ao reabrir", async () => {
    const response = await request(app("admin")).patch("/api/catalog/lealplus").send({ price: 24.9 });
    expect(response.status).toBe(200);
    expect(state.price).toBe("24.90");
    expect((await request(app()).get("/api/catalog/lealplus")).body).toEqual({ price: 24.9 });
  });
  it.each([undefined, "contador"] as const)("bloqueia alteração para %s", async role => {
    const response = await request(app(role)).patch("/api/catalog/lealplus").send({ price: 1 });
    expect(response.status).toBe(role ? 403 : 401);
    expect(state.price).toBe("19.90");
  });
  it.each([-1, 19.999, "abc", null])("não salva preço inválido %s", async price => {
    const response = await request(app("admin")).patch("/api/catalog/lealplus").send({ price });
    expect(response.status).toBe(400);
    expect(state.price).toBe("19.90");
  });
});