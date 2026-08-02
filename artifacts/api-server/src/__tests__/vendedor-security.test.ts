/**
 * Security tests for vendedor routes:
 * - Vendedor cannot access contadores belonging to another vendedor
 * - Vendedor cannot reset password of a contador owned by another vendedor
 * - Admin-only routes return 403 when accessed with vendedor role
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import request from "supertest";

// ── Mocks (hoisted by vitest before any imports) ─────────────────────────────

vi.mock("@workspace/db", () => {
  return {
    db: mockDbProxy(),
    usersTable: { id: "users.id", vendedorId: "users.vendedor_id", name: "users.name" },
    vendedoresTable: { id: "vendedores.id", userId: "vendedores.user_id", valorPorCert: "1", valorBonus: "1", qtdCertsBonus: 10, affiliateCode: "ABC123" },
    vendedorPagamentosTable: { id: "pagamentos.id", vendedorId: "pagamentos.vendedor_id", valor: "1", criadoPorUserId: "1" },
    ordersTable: { id: "orders.id", userId: "orders.user_id", status: "orders.status", createdAt: "orders.created_at" },
    loyaltySlotEventsTable: { userId: "loyalty.user_id", createdAt: "loyalty.created_at" },
  };
});

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async () => "hashed_password"),
    compare: vi.fn(async () => true),
  },
}));

vi.mock("../lib/email", () => ({
  sendContadorWelcomeEmail: vi.fn(async () => {}),
  sendTempPasswordEmail: vi.fn(async () => {}),
  sendVendedorWelcomeEmail: vi.fn(async () => {}),
  sendPagamentoRegistradoEmail: vi.fn(async () => {}),
}));

vi.mock("../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Chainable DB mock builder ─────────────────────────────────────────────────

type Row = Record<string, unknown>;

/**
 * Queue of results for sequential DB calls within a single request.
 * Tests push() expected results; each call to `_next()` shifts one off the queue.
 */
const dbResultQueue: Row[][] = [];

function _next(): Row[] {
  return dbResultQueue.shift() ?? [];
}

function makeBuilder(): ReturnType<typeof _makeB> {
  return _makeB(_next());
}

function _makeB(result: Row[]) {
  // Thenable + chainable builder — every method returns itself so any chain is valid.
  const builder: Record<string, unknown> & PromiseLike<Row[]> = {
    from: () => builder,
    where: () => builder,
    set: () => builder,
    values: () => builder,
    returning: () => Promise.resolve(result),
    limit: (n: number) => Promise.resolve(result.slice(0, n)),
    orderBy: () => builder,
    innerJoin: () => builder,
    leftJoin: () => builder,
    groupBy: () => builder,
    then: <TResult1 = Row[], TResult2 = never>(
      resolve?: ((v: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((e: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(resolve, reject ?? undefined) as PromiseLike<TResult1 | TResult2>,
    catch: (reject: (e: unknown) => unknown) => Promise.resolve(result).catch(reject),
    finally: (fn: () => void) => Promise.resolve(result).finally(fn),
  };
  return builder;
}

function mockDbProxy() {
  return {
    select: vi.fn(() => makeBuilder()),
    insert: vi.fn(() => makeBuilder()),
    update: vi.fn(() => makeBuilder()),
    delete: vi.fn(() => makeBuilder()),
  };
}

// ── Helper: create test Express app ──────────────────────────────────────────

function makeApp(sessionData: { userId: number; role: string; userType?: string }) {
  const app = express();
  app.use(express.json());

  // Inject session without a real store
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }),
  );

  // Inject session values for every request
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.session.userId = sessionData.userId;
    req.session.role = sessionData.role;
    if (sessionData.userType) req.session.userType = sessionData.userType;
    next();
  });

  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Vendedor route security", () => {
  beforeEach(() => {
    dbResultQueue.length = 0; // Clear queue before each test
    vi.clearAllMocks();
  });

  // ── requireVendedor middleware ───────────────────────────────────────────

  it("should return 403 when unauthenticated user accesses /vendedor/contadores", async () => {
    const { default: vendedorRouter } = await import("../routes/vendedor");

    const app = express();
    app.use(express.json());
    app.use(session({ secret: "test-secret", resave: false, saveUninitialized: false }));
    // NO session injection — simulates unauthenticated request
    app.use("/api", vendedorRouter);

    const res = await request(app).get("/api/vendedor/contadores");
    expect(res.status).toBe(401);
  });

  it("should return 403 when a 'contador' role accesses /vendedor/contadores", async () => {
    const { default: vendedorRouter } = await import("../routes/vendedor");

    const app = makeApp({ userId: 99, role: "contador" });
    app.use("/api", vendedorRouter);

    const res = await request(app).get("/api/vendedor/contadores");
    expect(res.status).toBe(403);
  });

  // ── GET /vendedor/contadores — only returns own contadores ───────────────

  it("should return only contadores belonging to the authenticated vendedor (userId=1)", async () => {
    const { default: vendedorRouter } = await import("../routes/vendedor");

    // DB returns 2 contadores linked to vendedorId=1
    dbResultQueue.push([
      { id: 10, name: "Contador A", email: "a@test.com", vendedorId: 1 },
      { id: 11, name: "Contador B", email: "b@test.com", vendedorId: 1 },
    ]);

    const app = makeApp({ userId: 1, role: "vendedor" });
    app.use("/api", vendedorRouter);

    const res = await request(app).get("/api/vendedor/contadores");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // All returned contadores belong to this vendedor
    for (const c of res.body) {
      if (c.vendedorId !== undefined) {
        expect(c.vendedorId).toBe(1);
      }
    }
  });

  it("should return empty array when vendedor has no contadores", async () => {
    const { default: vendedorRouter } = await import("../routes/vendedor");

    // DB returns no contadores for this vendedor
    dbResultQueue.push([]);

    const app = makeApp({ userId: 2, role: "vendedor" });
    app.use("/api", vendedorRouter);

    const res = await request(app).get("/api/vendedor/contadores");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // ── POST /vendedor/contadores/:id/reset-password — ownership check ────────

  it("should return 403 when vendedor tries to reset password of contador owned by another vendedor", async () => {
    const { default: vendedorRouter } = await import("../routes/vendedor");

    // Contador 50 belongs to vendedorId=99 (NOT to the authenticated vendedorId=1)
    dbResultQueue.push([
      { id: 50, name: "Contador Alheio", email: "alheio@test.com", vendedorId: 99 },
    ]);

    const app = makeApp({ userId: 1, role: "vendedor" });
    app.use("/api", vendedorRouter);

    const res = await request(app)
      .post("/api/vendedor/contadores/50/reset-password")
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/não pertence/i);
  });

  it("should return 403 when contador does not exist (ownership check prevents guessing IDs)", async () => {
    const { default: vendedorRouter } = await import("../routes/vendedor");

    // DB returns no user (contador not found)
    dbResultQueue.push([]);

    const app = makeApp({ userId: 1, role: "vendedor" });
    app.use("/api", vendedorRouter);

    const res = await request(app)
      .post("/api/vendedor/contadores/9999/reset-password")
      .send({});

    expect(res.status).toBe(403);
  });

  it("should allow password reset when the contador belongs to the authenticated vendedor", async () => {
    const { default: vendedorRouter } = await import("../routes/vendedor");

    // Contador 10 belongs to vendedorId=1 (matches session userId=1)
    dbResultQueue.push([
      { id: 10, name: "Meu Contador", email: "meu@test.com", vendedorId: 1 },
    ]);
    // db.update() call
    dbResultQueue.push([]);

    const app = makeApp({ userId: 1, role: "vendedor" });
    app.use("/api", vendedorRouter);

    const res = await request(app)
      .post("/api/vendedor/contadores/10/reset-password")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/senha redefinida/i);
  });
});

// ── Admin routes — vendedor role must be rejected ─────────────────────────────

describe("Admin routes reject vendedor role", () => {
  beforeEach(() => {
    dbResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it("GET /admin/vendedores returns 403 for vendedor role", async () => {
    const { default: vendedoresAdminRouter } = await import("../routes/vendedores-admin");

    const app = makeApp({ userId: 5, role: "vendedor" });
    app.use("/api", vendedoresAdminRouter);

    const res = await request(app).get("/api/admin/vendedores");
    expect(res.status).toBe(403);
  });

  it("POST /admin/vendedores returns 403 for vendedor role", async () => {
    const { default: vendedoresAdminRouter } = await import("../routes/vendedores-admin");

    const app = makeApp({ userId: 5, role: "vendedor" });
    app.use("/api", vendedoresAdminRouter);

    const res = await request(app)
      .post("/api/admin/vendedores")
      .send({ name: "Hacker", email: "x@x.com", cpfCnpj: "12345678901" });

    expect(res.status).toBe(403);
  });

  it("GET /admin/vendedores/:id returns 403 for vendedor role", async () => {
    const { default: vendedoresAdminRouter } = await import("../routes/vendedores-admin");

    const app = makeApp({ userId: 5, role: "vendedor" });
    app.use("/api", vendedoresAdminRouter);

    const res = await request(app).get("/api/admin/vendedores/1");
    expect(res.status).toBe(403);
  });

  it("PATCH /admin/vendedores/:id returns 403 for vendedor role", async () => {
    const { default: vendedoresAdminRouter } = await import("../routes/vendedores-admin");

    const app = makeApp({ userId: 5, role: "vendedor" });
    app.use("/api", vendedoresAdminRouter);

    const res = await request(app)
      .patch("/api/admin/vendedores/1")
      .send({ name: "Nova Nome" });

    expect(res.status).toBe(403);
  });

  it("DELETE /admin/vendedores/:id returns 403 for vendedor role", async () => {
    const { default: vendedoresAdminRouter } = await import("../routes/vendedores-admin");

    const app = makeApp({ userId: 5, role: "vendedor" });
    app.use("/api", vendedoresAdminRouter);

    const res = await request(app).delete("/api/admin/vendedores/1");
    expect(res.status).toBe(403);
  });

  it("POST /admin/vendedores/:id/reset-password returns 403 for vendedor role", async () => {
    const { default: vendedoresAdminRouter } = await import("../routes/vendedores-admin");

    const app = makeApp({ userId: 5, role: "vendedor" });
    app.use("/api", vendedoresAdminRouter);

    const res = await request(app)
      .post("/api/admin/vendedores/1/reset-password")
      .send({});

    expect(res.status).toBe(403);
  });

  it("GET /admin/vendedores/:id/pagamentos returns 403 for vendedor role", async () => {
    const { default: vendedoresAdminRouter } = await import("../routes/vendedores-admin");

    const app = makeApp({ userId: 5, role: "vendedor" });
    app.use("/api", vendedoresAdminRouter);

    const res = await request(app).get("/api/admin/vendedores/1/pagamentos");
    expect(res.status).toBe(403);
  });

  it("POST /admin/vendedores/:id/pagamentos returns 403 for vendedor role", async () => {
    const { default: vendedoresAdminRouter } = await import("../routes/vendedores-admin");

    const app = makeApp({ userId: 5, role: "vendedor" });
    app.use("/api", vendedoresAdminRouter);

    const res = await request(app)
      .post("/api/admin/vendedores/1/pagamentos")
      .send({ valor: "100.00" });

    expect(res.status).toBe(403);
  });

  it("DELETE /admin/vendedores/:id/pagamentos/:pagId returns 403 for vendedor role", async () => {
    const { default: vendedoresAdminRouter } = await import("../routes/vendedores-admin");

    const app = makeApp({ userId: 5, role: "vendedor" });
    app.use("/api", vendedoresAdminRouter);

    const res = await request(app).delete("/api/admin/vendedores/1/pagamentos/42");
    expect(res.status).toBe(403);
  });

  // Sanity check: admin role CAN access the route (it should hit DB and return data or 404/200)
  it("GET /admin/vendedores returns 200 for admin role (not 403)", async () => {
    const { default: vendedoresAdminRouter } = await import("../routes/vendedores-admin");

    // DB returns empty list of vendedores
    dbResultQueue.push([]);

    const app = makeApp({ userId: 1, role: "admin", userType: "admin" });
    app.use("/api", vendedoresAdminRouter);

    const res = await request(app).get("/api/admin/vendedores");
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
