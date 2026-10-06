import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[][],
  predicates: [] as unknown[],
}));

vi.mock("@workspace/db", async () => {
  const { pgTable, integer, text, boolean } = await import("drizzle-orm/pg-core");
  return {
    db: {
      select: vi.fn(() => {
        const rows = state.rows.shift() ?? [];
        const chain = {
          from: () => chain,
          where: (predicate: unknown) => { state.predicates.push(predicate); return chain; },
          limit: () => Promise.resolve(rows),
          then: Promise.resolve(rows).then.bind(Promise.resolve(rows)),
        };
        return chain;
      }),
      update: vi.fn(() => { throw new Error("Database writes are forbidden"); }),
    },
    ordersTable: pgTable("orders", {
      id: integer("id"), userId: integer("user_id"),
      garPedido: text("gar_pedido"), safewebSolicitacaoId: text("safeweb_solicitacao_id"),
      customerCpfCnpj: text("customer_cpf_cnpj"),
    }),
    usersTable: pgTable("users", {
      id: integer("id"), role: text("role"), userType: text("user_type"),
      contadorId: integer("contador_id"), isActive: boolean("is_active"),
    }),
    settingsTable: {}, orderEventsTable: {}, certificateRenewalsTable: {}, certificatesTable: {},
  };
});
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../lib/notify", () => ({ notifyScheduling: vi.fn(), notifyOrderStatus: vi.fn() }));
vi.mock("../lib/order-events", () => ({
  logEvent: vi.fn(), getOrderEvents: vi.fn(), isGarStatusEmitido: vi.fn(),
}));
vi.mock("../lib/gestaoar", async () => ({
  ...await vi.importActual<typeof import("../lib/gestaoar")>("../lib/gestaoar"),
  garConsultarPedido: vi.fn(async () => ({ Pedido: "123" })),
  garConsultarStatus: vi.fn(async () => ({ StatusPedido: "Protocolo gerado" })),
  garPedidosPorCliente: vi.fn(async () => ({
    PossuiPedidosVinculados: true, NomeCliente: "Titular", Status: 0,
    Pedidos: [{ Pedido: "123" }, { Pedido: "456" }, { Pedido: "789" }, { Protocolo: "123" }],
    ExtraGlobal: "must not leak",
  })),
  garPsBio: vi.fn(async () => ({ encontrado: true })),
}));
vi.mock("../lib/safeweb", async () => ({
  ...await vi.importActual<typeof import("../lib/safeweb")>("../lib/safeweb"),
  swCancelarSolicitacao: vi.fn(async () => ({ sucesso: true })),
  swRenovarComProduto: vi.fn(async () => ({ sucesso: true })),
  swLiberarRenovacao: vi.fn(async () => ({ sucesso: true })),
  swEmitirComProduto: vi.fn(async () => ({ sucesso: true })),
  swLiberarEmissao: vi.fn(async () => ({ sucesso: true })),
  swAgendaAgendar: vi.fn(async () => ({ sucesso: true })),
  swAgendaCancelar: vi.fn(async () => ({ sucesso: true })),
  swAgendaInformacoes: vi.fn(async () => ({ sucesso: true })),
  swConsultaCPF: vi.fn(async () => ({ Codigo: 0 })),
  swConsultaCNPJ: vi.fn(async () => ({ Codigo: 0 })),
  swBiometriaPSBioLocal: vi.fn(async () => ({ encontrado: true })),
  swBiometriaPSBioGlobal: vi.fn(async () => ({ encontrado: true })),
}));

import garRouter from "../routes/gestaoar";
import swRouter from "../routes/safeweb";
import * as gar from "../lib/gestaoar";
import * as sw from "../lib/safeweb";
import { db } from "@workspace/db";

const settings = {
  garApiKey: "test-only", safewebUrl: "https://safeweb.invalid",
  safewebUsername: "test-only", safewebPassword: "test-only",
};
const operator = { role: "operador", contadorId: 20, isActive: true };
const accountant = { id: 20, role: "contador", userType: "contador", isActive: true };
type Actor = { userId?: number; role?: string; userType?: string };
const officeActor = { userId: 101, role: "operador" };

function app(actor: Actor = officeActor) {
  const instance = express();
  instance.use(express.json());
  instance.use(session({ secret: "isolated-test-session", resave: false, saveUninitialized: false }));
  instance.use((req, _res, next) => { Object.assign(req.session, actor); next(); });
  instance.use("/api", garRouter, swRouter);
  return instance;
}

const directActions = [
  { method: "get", path: "/gestaoar/pedido/123", call: gar.garConsultarPedido },
  { method: "get", path: "/gestaoar/pedido/123/status", call: gar.garConsultarStatus },
  { method: "post", path: "/safeweb/solicitacao/123/cancelar", call: sw.swCancelarSolicitacao },
  { method: "get", path: "/safeweb/renovacao/123", call: sw.swRenovarComProduto },
  { method: "post", path: "/safeweb/renovacao/123/liberar", call: sw.swLiberarRenovacao },
  { method: "get", path: "/safeweb/emissao/123", call: sw.swEmitirComProduto },
  { method: "post", path: "/safeweb/emissao/123/liberar", call: sw.swLiberarEmissao },
  { method: "post", path: "/safeweb/agenda/agendar", call: sw.swAgendaAgendar },
  { method: "delete", path: "/safeweb/agenda/123", call: sw.swAgendaCancelar },
  { method: "get", path: "/safeweb/agenda/123/informacoes", call: sw.swAgendaInformacoes },
] as const;
const payload = { contadorId: 30, idSolicitacao: 456, protocolo: "123", localAtendimentoId: 1, data: "2030-10-08" };

beforeEach(() => {
  state.rows.length = 0;
  state.predicates.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Live providers are forbidden"); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  expect(db.update).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe.each(directActions)("Direct provider route $method $path", action => {
  it("rejects unauthenticated requests before database/provider access", async () => {
    const response = await request(app({}))[action.method](`/api${action.path}`).send(payload);
    expect(response.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
    expect(action.call).not.toHaveBeenCalled();
  });

  it.each([
    { name: "another office", rows: [{ userId: 30 }] },
    { name: "no local order", rows: [] },
    { name: "unowned local order", rows: [{ userId: null }] },
    { name: "conflicting local IDs", rows: [{ userId: 20 }, { userId: 30 }] },
  ])("blocks $name without contacting the provider", async fixture => {
    state.rows.push(fixture.rows);
    for (const _row of fixture.rows) state.rows.push([operator], [accountant]);
    const response = await request(app())[action.method](`/api${action.path}?contadorId=30`).send(payload);
    expect(response.status).toBe(403);
    expect(action.call).not.toHaveBeenCalled();
  });

  it.each([
    { name: "linked operator", actor: officeActor, owner: 20 },
    { name: "legacy operator-owned order", actor: officeActor, owner: 101 },
    { name: "accountant owner", actor: { userId: 20, role: "contador" }, owner: 20 },
  ])("allows $name", async fixture => {
    state.rows.push([{ userId: fixture.owner }]);
    if (fixture.actor.role === "operador") state.rows.push([operator], [accountant]);
    state.rows.push([settings]);
    const response = await request(app(fixture.actor))[action.method](`/api${action.path}`).send(payload);
    expect(response.status).toBe(200);
    expect(action.call).toHaveBeenCalledOnce();
    const query = new PgDialect().sqlToQuery(state.predicates[0] as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(query.params).toEqual(["123"]);
    expect(query.sql).toContain(action.path.startsWith("/gestaoar") ? "gar_pedido" : "safeweb_solicitacao_id");
    if (action.path.endsWith("/liberar")) {
      expect(vi.mocked(action.call).mock.calls[0][1]).toMatchObject({ idSolicitacao: 123 });
    }
  });

  it.each([
    { userId: 1, role: "admin" },
    { userId: 1, role: "agente", userType: "admin" },
  ])("preserves administrator access without a local order", async actor => {
    state.rows.push([settings]);
    expect((await request(app(actor))[action.method](`/api${action.path}`).send(payload)).status).toBe(200);
    expect(action.call).toHaveBeenCalledOnce();
    expect(db.select).toHaveBeenCalledOnce();
  });

  it.each([
    { name: "inactive operator", op: { ...operator, isActive: false }, owner: accountant },
    { name: "orphaned operator", op: { ...operator, contadorId: null }, owner: accountant },
    { name: "inactive office", op: operator, owner: { ...accountant, isActive: false } },
    { name: "invalid office role", op: operator, owner: { ...accountant, role: "cliente" } },
    { name: "invalid office type", op: operator, owner: { ...accountant, userType: "cliente" } },
  ])("blocks $name", async fixture => {
    state.rows.push([{ userId: 20 }], [fixture.op], [fixture.owner]);
    expect((await request(app())[action.method](`/api${action.path}`).send(payload)).status).toBe(403);
    expect(action.call).not.toHaveBeenCalled();
  });
});

describe("GAR customer order list", () => {
  const path = "/api/gestaoar/cliente/000.000.000-00/pedidos?contadorId=30";

  it("filters each external order, excluding other offices, unknown IDs and protocol-only rows", async () => {
    state.rows.push(
      [{ userId: 20, garPedido: "000123" }, { userId: 30, garPedido: "456" }],
      [operator], [accountant], [operator], [accountant], [settings],
    );
    const response = await request(app()).get(path);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      PossuiPedidosVinculados: true, NomeCliente: "Titular", Status: 0, Pedidos: [{ Pedido: "123" }],
    });
    const query = new PgDialect().sqlToQuery(state.predicates[0] as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(query.params).toEqual(["00000000000"]);
    expect(query.sql).toContain("customer_cpf_cnpj");
  });

  it.each([
    { rows: [] },
    { rows: [{ userId: 30, garPedido: "456" }] },
    { rows: [{ userId: 20, garPedido: "123" }, { userId: 30, garPedido: "000123" }] },
  ])("rejects absent, foreign or conflicting local associations", async ({ rows }) => {
    state.rows.push(rows);
    for (const _row of rows) state.rows.push([operator], [accountant]);
    expect((await request(app()).get(path)).status).toBe(403);
    expect(gar.garPedidosPorCliente).not.toHaveBeenCalled();
  });

  it("does not expose customer metadata when all returned orders are unauthorized", async () => {
    state.rows.push([{ userId: 20, garPedido: "999" }], [settings]);
    const response = await request(app({ userId: 20, role: "contador" })).get(path);
    expect(response.body).toEqual({ PossuiPedidosVinculados: false, Pedidos: [], Status: 0 });
  });

  it("preserves the full provider response for admins", async () => {
    state.rows.push([settings]);
    const response = await request(app({ userId: 1, userType: "admin" })).get(path);
    expect(response.status).toBe(200);
    expect(response.body.Pedidos).toHaveLength(4);
    expect(response.body.ExtraGlobal).toBe("must not leak");
  });
});

describe("Provider identifier boundaries", () => {
  it.each(["00123", "%20%20000123%20"])("matches padded GAR IDs: %s", async id => {
    state.rows.push([{ userId: 20 }], [settings]);
    expect((await request(app({ userId: 20, role: "contador" })).get(`/api/gestaoar/pedido/${id}`)).status).toBe(200);
    const query = new PgDialect().sqlToQuery(state.predicates[0] as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(query.params).toEqual(["123"]);
    expect(query.sql).toContain("btrim");
    expect(query.sql).toContain("ltrim");
    expect(query.sql).toContain("^[0-9]+$");
  });

  it.each(["0", "1e2", "not-an-order", "9007199254740993"])("denies invalid GAR identity %s without lookup", async id => {
    expect((await request(app()).get(`/api/gestaoar/pedido/${id}`)).status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
    expect(gar.garConsultarPedido).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "1.5", "Infinity", "NaN", "9007199254740993"])("rejects invalid cancellation ID %s", async id => {
    expect((await request(app()).post(`/api/safeweb/solicitacao/${id}/cancelar`)).status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
    expect(sw.swCancelarSolicitacao).not.toHaveBeenCalled();
  });

  it("matches opaque Safeweb protocols without using generic order protocol fields", async () => {
    state.rows.push([{ userId: 20 }], [settings]);
    expect((await request(app({ userId: 20, role: "contador" })).get("/api/safeweb/agenda/SW-TEST/informacoes")).status).toBe(200);
    const query = new PgDialect().sqlToQuery(state.predicates[0] as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(query.params).toEqual(["SW-TEST"]);
    expect(query.sql).toContain("safeweb_solicitacao_id");
    expect(sw.swAgendaInformacoes).toHaveBeenCalledWith(expect.anything(), "SW-TEST");
  });
});

describe("Legitimate pre-purchase consultations", () => {
  it.each([
    { path: "/gestaoar/psbio", body: { cpf: "00000000000" }, call: gar.garPsBio },
    { path: "/safeweb/consulta-cpf", body: { cpf: "00000000000", dataNascimento: "01/01/1990" }, call: sw.swConsultaCPF },
    { path: "/safeweb/consulta-cnpj", body: { cnpj: "00000000000000", cpfResponsavel: "00000000000", dataNascimento: "01/01/1990" }, call: sw.swConsultaCNPJ },
    { path: "/safeweb/biometria/psbio-local", body: { cpf: "00000000000" }, call: sw.swBiometriaPSBioLocal },
    { path: "/safeweb/biometria/psbio-global", body: { cpf: "00000000000" }, call: sw.swBiometriaPSBioGlobal },
  ])("keeps $path available without any local order", async action => {
    state.rows.push([settings]);
    const response = await request(app()).post(`/api${action.path}`).send(action.body);
    expect(response.status).toBe(200);
    expect(action.call).toHaveBeenCalledOnce();
    expect(db.select).toHaveBeenCalledOnce();
  });
});
