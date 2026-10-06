import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Request } from "express";
import session from "express-session";
import request from "supertest";

type Row = Record<string, unknown>;
const results: Row[][] = [];
function builder(rows: Row[] = []) {
  const chain = {
    from: () => chain,
    where: () => chain,
    leftJoin: () => chain,
    orderBy: () => chain,
    set: () => chain,
    limit: () => Promise.resolve(rows),
    then: Promise.resolve(rows).then.bind(Promise.resolve(rows)),
  };
  return chain;
}
vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => builder(results.shift() ?? [])),
    update: vi.fn(() => builder()),
  },
  usersTable: { id: "users.id", role: "users.role", userType: "users.user_type", contadorId: "users.contador_id", isActive: "users.is_active", phone: "users.phone" },
  ordersTable: { id: "orders.id", userId: "orders.user_id", operatorId: "orders.operator_id", certificateId: "orders.certificate_id" },
  certificatesTable: { id: "certificates.id", name: "certificates.name" },
  settingsTable: {},
  couponsTable: {},
  orderEventsTable: {},
  certificateRenewalsTable: {},
}));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../lib/notify", () => ({
  notifyScheduling: vi.fn(async () => {}),
  notifyOrderStatus: vi.fn(async () => {}),
  sendWaText: vi.fn(async () => {}),
}));
vi.mock("../lib/order-events", () => ({
  logEvent: vi.fn(async () => {}),
  getOrderEvents: vi.fn(async () => []),
  isGarStatusEmitido: vi.fn(() => false),
}));
vi.mock("../lib/gestaoar", async () => ({
  ...await vi.importActual<typeof import("../lib/gestaoar")>("../lib/gestaoar"),
  garLocaisAgendamento: vi.fn(async () => [{ HashLocal: "local-1", NomeLocalAgendamento: "Videoconferência" }]),
  garSlotsLocal: vi.fn(async () => []),
  garDisponibilidadeAgenda: vi.fn(async () => ({ Datas: [{ DataAgenda: "2030-10-08", Horarios: [{ HoraInicial: "10:00", HoraFinal: "10:30" }] }] })),
  garAgendar: vi.fn(async () => []),
  garExcluirAgendamento: vi.fn(async () => []),
  garComprar: vi.fn(async () => ({ Status: 0, Produtos: [] })),
  garConsultarStatus: vi.fn(async () => ({ StatusPedido: "Protocolo gerado" })),
}));

const operator = { id: 101, role: "operador", contadorId: 20, isActive: true };
const contador = { id: 20, role: "contador", userType: "contador", isActive: true };
const order = {
  id: 50, userId: 20, operatorId: 102, customerName: "Cliente de teste",
  customerCpfCnpj: "00000000000", customerEmail: null, customerPhone: null,
  garPedido: "123", garProtocolo: "PROTO-TEST", garHashVenda: "VENDA-TEST",
  safewebSolicitacaoId: "SW-TEST", clientType: "cpf", total: "90.00",
};
const settings = { garApiKey: "test-only", garHashVendedor: "test", garHashTabela: "test" };

type Action = { method: "get" | "post"; path: string; gar?: boolean; data?: Row; nested?: boolean; events?: boolean };
const actions: Action[] = [
  { method: "get", path: "/orders/50/events", gar: true, events: true },
  { method: "get", path: "/orders/50/gar-locais", gar: true },
  { method: "get", path: "/orders/50/gar-slots/local-1", gar: true },
  { method: "get", path: "/orders/50/gar-disponibilidade?hashLocal=local-1&dataInicial=2030-10-08%2000:00&dataFinal=2030-10-08%2023:59" },
  { method: "get", path: "/orders/50/gar-disponibilidade?hashLocal=local-1&dataInicial=2030-10-08%2000:00&dataFinal=2030-10-08%2023:59", gar: true },
  { method: "post", path: "/orders/50/agendar", data: { hashLocal: "local-1", dataInicial: "2030-10-08 10:00", dataFinal: "2030-10-08 10:30" } },
  { method: "post", path: "/orders/50/agendar", gar: true, data: { hashLocal: "local-1", dataInicial: "2030-10-08 10:00", dataFinal: "2030-10-08 10:30" } },
  { method: "post", path: "/orders/50/gar-comprar", gar: true, data: { hashProduto: ["test"] } },
  { method: "post", path: "/gestaoar/sync-order/50", gar: true, nested: true },
  { method: "post", path: "/orders/50/payment", nested: true },
  { method: "post", path: "/orders/50/sync-payment", nested: true },
  { method: "post", path: "/orders/50/confirm-docs" },
  { method: "post", path: "/orders/50/hope-solicitation" },
  { method: "post", path: "/orders/50/gar-cancelar-agendamento" },
  { method: "post", path: "/orders/50/safeweb-agendar", data: { idLocal: "local-1", dataInicial: "2030-10-08 10:00", dataFinal: "2030-10-08 10:30" } },
  { method: "get", path: "/orders/50/safeweb-config?idLocal=1" },
  { method: "get", path: "/orders/50/safeweb-locais" },
  { method: "get", path: "/orders/50/safeweb-slots?idLocal=1&data=2030-10-08", nested: true },
];

async function app(action: Action, userId = 101, role = "operador") {
  const { default: router } = action.gar
    ? await import("../routes/gestaoar")
    : await import("../routes/orders");
  const instance = express();
  instance.use(express.json());
  instance.use(session({ secret: "test-session-only", resave: false, saveUninitialized: false }));
  instance.use((req, _res, next) => {
    req.session.userId = userId;
    req.session.role = role;
    req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Request["log"];
    next();
  });
  instance.use("/api", router);
  return instance;
}
function seed(action: Action, owner = 20, linked = true) {
  if (action.gar && !action.events) results.push([settings]);
  const item = { ...order, userId: owner, operatorId: owner === 20 ? 102 : 101 };
  results.push([(action.gar && !action.events) || action.nested ? { order: item, certName: "Certificado", cert: {} } : item]);
  if (linked) results.push([operator], [contador]);
  results.push(action.events ? [] : [settings]);
}

describe("Operator normal order flow — isolated providers and database", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    results.length = 0;
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Real network requests are forbidden in these tests"); }));
  });

  it.each(actions)("allows the linked office: $method $path (GAR router: $gar)", async action => {
    seed(action);
    const instance = await app(action);
    const response = await request(instance)[action.method](`/api${action.path}`).send(action.data ?? {});
    // Some actions stop at missing payment/Safeweb settings, rather than contact live providers.
    expect([200, 400, 503]).toContain(response.status);
    expect(response.body.error ?? "").not.toMatch(/Acesso negado/);
    const { db } = await import("@workspace/db");
    expect(vi.mocked(db.select).mock.calls.length).toBeGreaterThanOrEqual(action.gar && !action.events ? 4 : 3);
    if (action.path.includes("gar-locais")) expect(response.body[0].HashLocal).toBe("local-1");
    if (action.path.includes("gar-disponibilidade")) expect(response.body.Datas[0].Horarios[0].HoraInicial).toBe("10:00");
    if (action.path === "/orders/50/agendar") expect(response.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(actions)("blocks another office, even with operator attribution: $method $path (GAR router: $gar)", async action => {
    seed(action, 30);
    const instance = await app(action);
    const response = await request(instance)[action.method](`/api${action.path}`).send({ ...action.data, contadorId: 30 });
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([{ userId: 20, role: "contador" }, { userId: 1, role: "admin" }])("preserves $role access", async actor => {
    const action = actions.find(a => a.path === "/orders/50/gar-locais")!;
    seed(action, 20, false);
    expect((await request(await app(action, actor.userId, actor.role)).get(`/api${action.path}`)).status).toBe(200);
  });

  it.each([
    { name: "inactive operator", operator: { ...operator, isActive: false }, contador },
    { name: "missing link", operator: { ...operator, contadorId: null }, contador },
    { name: "inactive accountant", operator, contador: { ...contador, isActive: false } },
    { name: "invalid accountant role", operator, contador: { ...contador, role: "cliente" } },
  ])("rejects $name", async fixture => {
    results.push([settings], [{ order }], [fixture.operator], [fixture.contador]);
    const action = actions.find(a => a.path === "/orders/50/gar-locais")!;
    expect((await request(await app(action)).get("/api/orders/50/gar-locais")).status).toBe(403);
  });
});
