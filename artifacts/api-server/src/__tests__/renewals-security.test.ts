import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import request from "supertest";

type Row = Record<string, unknown>;

const results: Row[][] = [];

function nextResult() {
  return results.shift() ?? [];
}

function makeBuilder(result = nextResult()) {
  const builder: Record<string, unknown> & PromiseLike<Row[]> = {
    from: () => builder,
    where: () => builder,
    innerJoin: () => builder,
    orderBy: () => builder,
    limit: (count: number) => Promise.resolve(result.slice(0, count)),
    then: <TResult1 = Row[], TResult2 = never>(
      resolve?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(resolve, reject ?? undefined) as PromiseLike<TResult1 | TResult2>,
  };
  return builder;
}

function mockDb() {
  return {
    select: vi.fn(() => makeBuilder()),
    update: vi.fn(() => makeBuilder()),
  };
}

vi.mock("@workspace/db", () => ({
  db: mockDb(),
  certificateRenewalsTable: { id: "renewals.id", orderId: "renewals.order_id", expiresAt: "renewals.expires_at" },
  ordersTable: { id: "orders.id", userId: "orders.user_id" },
  usersTable: {
    id: "users.id",
    role: "users.role",
    userType: "users.user_type",
    contadorId: "users.contador_id",
    isActive: "users.is_active",
  },
  settingsTable: {},
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/email", () => ({
  sendRenewalAlertEmail: vi.fn(),
}));

function appWithSession(sessionData?: { userId: number; role: string; userType?: string }) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test-secret", resave: false, saveUninitialized: false }));
  if (sessionData) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.session.userId = sessionData.userId;
      req.session.role = sessionData.role;
      req.session.userType = sessionData.userType;
      next();
    });
  }
  return app;
}

describe("Renewal office access", () => {
  beforeEach(() => {
    results.length = 0;
    vi.clearAllMocks();
  });

  it("rejects unauthenticated and non-office roles", async () => {
    const { default: renewalsRouter } = await import("../routes/renewals");

    const unauthenticated = appWithSession();
    unauthenticated.use("/api", renewalsRouter);
    expect((await request(unauthenticated).get("/api/renewals")).status).toBe(401);

    const client = appWithSession({ userId: 80, role: "contador", userType: "cliente" });
    client.use("/api", renewalsRouter);
    expect((await request(client).get("/api/renewals")).status).toBe(403);
  });

  it("keeps the complete renewal list for administrators", async () => {
    results.push([{ id: 1, customerName: "Cliente geral" }]);
    const { default: renewalsRouter } = await import("../routes/renewals");
    const app = appWithSession({ userId: 1, role: "admin", userType: "admin" });
    app.use("/api", renewalsRouter);

    const response = await request(app).get("/api/renewals");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: 1, customerName: "Cliente geral" }]);
  });

  it("returns only rows scoped to the authenticated contador's commercial account", async () => {
    results.push(
      [{ id: 20, role: "contador", userType: "contador", isActive: true }],
      [{
        renewal: {
          id: 101,
          customerName: "Cliente do escritório",
          expiresAt: "2027-01-10T00:00:00.000Z",
          alertSent30d: false,
          alertSent7d: true,
          alertSent1d: false,
        },
      }],
    );
    const { db } = await import("@workspace/db");
    const { default: renewalsRouter } = await import("../routes/renewals");
    const app = appWithSession({ userId: 20, role: "contador", userType: "contador" });
    app.use("/api", renewalsRouter);

    const response = await request(app).get("/api/renewals");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{
      id: 101,
      customerName: "Cliente do escritório",
      expiresAt: "2027-01-10T00:00:00.000Z",
      alertSent30d: false,
      alertSent7d: true,
      alertSent1d: false,
    }]);
    expect(response.body[0]).not.toHaveProperty("customerCpfCnpj");
    expect(response.body[0]).not.toHaveProperty("customerEmail");
    expect(response.body[0]).not.toHaveProperty("certificateName");
    expect(response.body[0]).not.toHaveProperty("garPedido");
    expect(response.body[0]).not.toHaveProperty("garProtocolo");
    expect(response.body[0]).not.toHaveProperty("orderId");
    expect(response.body[0]).not.toHaveProperty("emittedAt");
    expect(db.select).toHaveBeenCalledTimes(2);
    expect((db.select as ReturnType<typeof vi.fn>).mock.calls[1][0]).toHaveProperty("renewal");
  });

  it("uses the linked contador account when an operator lists renewals", async () => {
    results.push(
      [{ id: 32, role: "operador", userType: "contador", contadorId: 20, isActive: true }],
      [{ id: 20, role: "contador", userType: "contador", isActive: true }],
      [{
        renewal: {
          id: 102,
          customerName: "Cliente do contador vinculado",
          expiresAt: "2027-01-10T00:00:00.000Z",
          alertSent30d: false,
          alertSent7d: false,
          alertSent1d: false,
        },
      }],
    );
    const { default: renewalsRouter } = await import("../routes/renewals");
    const app = appWithSession({ userId: 32, role: "operador", userType: "contador" });
    app.use("/api", renewalsRouter);

    const response = await request(app).get("/api/renewals");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{
      id: 102,
      customerName: "Cliente do contador vinculado",
      expiresAt: "2027-01-10T00:00:00.000Z",
      alertSent30d: false,
      alertSent7d: false,
      alertSent1d: false,
    }]);
    expect(response.body[0]).not.toHaveProperty("customerCpfCnpj");
    expect(response.body[0]).not.toHaveProperty("certificateName");
  });

  it("does not let contador or operator trigger renewal emails", async () => {
    const { default: renewalsRouter } = await import("../routes/renewals");
    const app = appWithSession({ userId: 20, role: "contador", userType: "contador" });
    app.use("/api", renewalsRouter);

    expect((await request(app).post("/api/renewals/check-alerts")).status).toBe(403);
  });
});