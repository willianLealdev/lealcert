import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import request from "supertest";

type Row = Record<string, unknown>;

const resultQueue: Row[][] = [];
const insertedValues: unknown[] = [];

function nextResult(): Row[] {
  return resultQueue.shift() ?? [];
}

function builder(result: Row[]) {
  const chain: Record<string, unknown> & PromiseLike<Row[]> = {
    from: () => chain,
    where: () => chain,
    set: () => chain,
    values: (values: unknown) => {
      insertedValues.push(values);
      return chain;
    },
    returning: () => Promise.resolve(result),
    limit: (count: number) => Promise.resolve(result.slice(0, count)),
    orderBy: () => chain,
    then: <TResult1 = Row[], TResult2 = never>(
      resolve?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(resolve, reject ?? undefined) as PromiseLike<TResult1 | TResult2>,
  };
  return chain;
}

function mockDb() {
  return {
    select: vi.fn(() => builder(nextResult())),
    insert: vi.fn(() => builder(nextResult())),
    update: vi.fn(() => builder(nextResult())),
    delete: vi.fn(() => builder(nextResult())),
  };
}

vi.mock("@workspace/db", () => ({
  db: mockDb(),
  certificatesTable: { id: "certificates.id", active: "certificates.active" },
  usersTable: { id: "users.id", cpfCnpj: "users.cpf_cnpj", email: "users.email", role: "users.role", userType: "users.user_type" },
  ordersTable: { id: "orders.id", userId: "orders.user_id", orderNumber: "orders.order_number", couponId: "orders.coupon_id" },
  settingsTable: {},
  couponsTable: { code: "coupons.code", active: "coupons.active", id: "coupons.id", usageCount: "coupons.usage_count" },
}));

vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(), compare: vi.fn() } }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../lib/email", () => ({
  sendTempPasswordEmail: vi.fn(async () => {}),
  sendOrderStatusEmail: vi.fn(async () => {}),
  sendWelcomeEmail: vi.fn(async () => {}),
}));
vi.mock("../lib/order-events", () => ({ logEvent: vi.fn() }));
vi.mock("../lib/loyalty", () => ({ getAvailableCortesias: vi.fn(async () => 1), useCorteisa: vi.fn(async () => 1) }));
vi.mock("../lib/gar-auto", () => ({ garAutoComprar: vi.fn(async () => {}) }));
vi.mock("../lib/sw-auto", () => ({ swAutoComprar: vi.fn(async () => {}) }));

const certificate = {
  id: 900,
  name: "Certificado de teste",
  price: "199.90",
  priceContador: "90.00",
  active: true,
  product: "e-CPF",
};

const contadorHolder = { id: 40, name: "Contador titular", email: "holder@example.com", role: "contador", userType: "contador" };
const createdOrder = { id: 500, orderNumber: "20260820-0001" };
const checkoutPayload = {
  certificateId: 900,
  personType: "fisica",
  cpf: "11144477735",
  customerName: "Titular do certificado",
  customerEmail: "titular@example.com",
  termsAccepted: true,
  extendedWarranty: false,
  paymentMethod: "cortesia",
};

function appForSession(userId?: number) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "checkout-pricing-test", resave: false, saveUninitialized: false }));
  if (userId) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.session.userId = userId;
      req.session.role = "contador";
      next();
    });
  }
  return app;
}

function queueCheckout(userType?: "contador" | "cliente") {
  resultQueue.push(
    [certificate],
    [contadorHolder],
    ...(userType ? [[{ userType }]] : []),
    [{ activeProvider: "gestaoar" }],
    [],
    [createdOrder],
  );
}

function insertedTotal(): number {
  const order = insertedValues[0] as { total: string };
  return Number(order.total);
}

describe("checkout partner price ownership", () => {
  beforeEach(() => {
    resultQueue.length = 0;
    insertedValues.length = 0;
    vi.clearAllMocks();
  });

  it("keeps partner pricing when an authenticated contador buys for another document", async () => {
    queueCheckout("contador");
    const { default: checkoutRouter } = await import("../routes/checkout");
    const app = appForSession(10);
    app.use("/api", checkoutRouter);

    const response = await request(app).post("/api/public/checkout/submit").send(checkoutPayload);

    expect(response.status).toBe(200);
    expect(insertedTotal()).toBe(90);
  });

  it("refuses cortesia when an authenticated client buys for a contador document", async () => {
    queueCheckout("cliente");
    const { default: checkoutRouter } = await import("../routes/checkout");
    const app = appForSession(11);
    app.use("/api", checkoutRouter);

    const response = await request(app).post("/api/public/checkout/submit").send(checkoutPayload);

    expect(response.status).toBe(403);
    expect(insertedTotal()).toBe(199.9);
  });

  it("uses standard pricing without a session even when the submitted document belongs to a contador", async () => {
    queueCheckout();
    const { default: checkoutRouter } = await import("../routes/checkout");
    const app = appForSession();
    app.use("/api", checkoutRouter);

    const response = await request(app).post("/api/public/checkout/submit").send(checkoutPayload);

    expect(response.status).toBe(401);
    expect(insertedTotal()).toBe(199.9);
  });
});