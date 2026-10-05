import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({
  coupon: null as Record<string, unknown> | null,
  owner: { id: 10, name: "Teste", role: "contador", userType: "contador", isActive: true, contadorId: null as number | null },
  used: 0,
  order: null as Record<string, unknown> | null,
  usageUpdates: 0,
  tx: vi.fn(),
  locked: vi.fn(),
  fetch: vi.fn(),
  payment: false,
}));

vi.mock("@workspace/db", async () => {
  const schema = await import("../../../../lib/db/src/schema/index");
  function select(selection?: Record<string, unknown>) {
    let table: unknown;
    const chain = {
      from: (value: unknown) => { table = value; return chain; },
      where: () => chain, limit: () => chain, leftJoin: () => chain,
      for: (mode: string) => { state.locked(mode); return chain; },
      then: (resolve: (value: unknown) => unknown) => {
        const rows = table === schema.certificatesTable ? [{
          id: 900, name: "Certificado teste", price: "199.90", priceContador: "90.00", issuanceType: "Videoconferência",
        }] : table === schema.usersTable ? [state.owner]
          : table === schema.couponsTable ? state.coupon ? [state.coupon] : []
          : table === schema.settingsTable ? [{ price: "19.90", mpAccessToken: "fake-test-token", siteUrl: "https://example.test" }]
          : selection?.used ? [{ used: state.used }]
          : state.payment && state.order ? [{ order: state.order, certName: "Certificado teste" }] : [];
        return Promise.resolve(rows).then(resolve);
      },
    };
    return chain;
  }
  const mockDb = {
    select,
    insert: () => ({ values: (values: Record<string, unknown>) => ({
      returning: async () => {
        state.order = { ...values, id: 500, createdAt: new Date() };
        return [state.order];
      },
    }) }),
    update: (table: unknown) => ({ set: () => ({ where: async () => {
      if (table === schema.couponsTable) state.usageUpdates++;
    } }) }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      state.tx();
      return run(mockDb);
    },
  };
  return { ...schema, db: mockDb };
});
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../lib/notify", () => ({ notifyOrderStatus: vi.fn(async () => {}), notifyScheduling: vi.fn(), sendWaText: vi.fn() }));
vi.mock("../lib/order-events", () => ({ logEvent: vi.fn(async () => {}) }));
import ordersRouter from "../routes/orders";
import { orderCouponDiscount } from "../lib/order-coupon";

function app() {
  const server = express();
  server.use(express.json());
  server.use(session({ secret: "coupon-regression-test", resave: false, saveUninitialized: false }));
  server.use((req, _res, next) => {
    req.session.userId = 10;
    req.session.role = "contador";
    req.session.userType = "contador";
    next();
  });
  server.use("/api", ordersRouter);
  return server;
}
const payload = {
  certificateId: 900, clientType: "cpf", customerName: "Teste",
  customerCpfCnpj: "11144477735", couponCode: " desconto ",
};
const coupon = {
  id: 70, code: "DESCONTO", type: "percent", value: "10",
  active: true, expiresAt: null, usageLimit: 10, usageCount: 0, perUserLimit: null, target: "all",
};

describe("Cupom persistido do Novo Pedido até o pagamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.coupon = { ...coupon };
    state.order = null;
    state.used = 0;
    state.usageUpdates = 0;
    state.payment = false;
    state.owner = { id: 10, name: "Teste", role: "contador", userType: "contador", isActive: true, contadorId: null };
    vi.stubGlobal("fetch", state.fetch);
  });

  it("salva cupom e total reduzido e envia exatamente esse total ao PIX", async () => {
    const server = app();
    const response = await request(server).post("/api/orders").send({
      ...payload, total: 1, discount: 89, couponId: 999,
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ total: 81, couponId: 70 });
    expect(state.order).toMatchObject({ total: "81", couponId: 70 });
    expect(state.usageUpdates).toBe(1);
    expect(state.tx).toHaveBeenCalledOnce();
    expect(state.locked).toHaveBeenCalledWith("update");

    state.payment = true;
    state.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({
      id: 123, status: "pending", point_of_interaction: { transaction_data: {
        qr_code: "test-pix", qr_code_base64: "test-image",
      } },
    }) });
    const payment = await request(server).post("/api/orders/500/payment").send({ method: "pix", total: 90 });
    expect(payment.status).toBe(200);
    expect(JSON.parse(state.fetch.mock.calls[0][1].body)).toMatchObject({ transaction_amount: 81 });
  });

  it("salva desconto fixo e preserva adicional do Leal Plus", async () => {
    state.coupon = { ...coupon, type: "fixed", value: "20.00" };
    const response = await request(app()).post("/api/orders").send({ ...payload, extendedWarranty: true });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ total: 89.9, couponId: 70, lealPlusPrice: 19.9 });
    expect(state.order).toMatchObject({ total: "89.9", couponId: 70, lealPlusPrice: "19.90" });
  });

  it.each([
    [null, 404],
    [{ ...coupon, active: false }, 404],
    [{ ...coupon, expiresAt: new Date("2000-01-01") }, 410],
    [{ ...coupon, usageCount: 10 }, 410],
    [{ ...coupon, target: "cliente" }, 403],
  ])("não cria pedido com cupom inválido/esgotado: %j", async (invalid, status) => {
    state.coupon = invalid;
    const response = await request(app()).post("/api/orders").send(payload);
    expect(response.status).toBe(status);
    expect(state.order).toBeNull();
    expect(state.usageUpdates).toBe(0);
  });

  it("revalida limite por conta comercial na criação", async () => {
    state.coupon = { ...coupon, perUserLimit: 1 };
    state.used = 1;
    expect((await request(app()).post("/api/orders").send(payload)).status).toBe(410);
    expect(state.order).toBeNull();
  });

  it("sem cupom mantém o valor original e não consome uso", async () => {
    const response = await request(app()).post("/api/orders").send({ ...payload, couponCode: undefined });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ total: 90, couponId: null });
    expect(state.usageUpdates).toBe(0);
  });

  it("arredonda em centavos e limita desconto ao certificado", () => {
    expect(orderCouponDiscount(99.9, { type: "percent", value: "15" })).toBe(14.99);
    expect(orderCouponDiscount(90, { type: "percent", value: "200" })).toBe(90);
    expect(orderCouponDiscount(90, { type: "fixed", value: "150.00" })).toBe(90);
  });

  it("ambos envios de Novo Pedido carregam o código validado", () => {
    const source = readFileSync(new URL("../../../lealcert/src/pages/orders/new.tsx", import.meta.url), "utf8");
    expect(source.match(/couponCode: appliedCoupon\?\.code/g)).toHaveLength(2);
  });
});
