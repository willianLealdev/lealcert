import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const resultQueue: Row[][] = [];
const db = {
  select: vi.fn(() => builder(resultQueue.shift() ?? [])),
  insert: vi.fn(() => builder(resultQueue.shift() ?? [])),
  update: vi.fn(() => builder(resultQueue.shift() ?? [])),
};

function builder(result: Row[]) {
  const chain: Record<string, unknown> & PromiseLike<Row[]> = {
    from: () => chain,
    where: () => chain,
    values: () => chain,
    set: () => chain,
    orderBy: () => chain,
    limit: (count: number) => Promise.resolve(result.slice(0, count)),
    returning: () => Promise.resolve(result),
    then: <TResult1 = Row[], TResult2 = never>(
      resolve?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(resolve, reject ?? undefined) as PromiseLike<TResult1 | TResult2>,
  };
  return chain;
}

vi.mock("@workspace/db", () => ({
  db,
  settingsTable: {},
  ordersTable: { id: "orders.id" },
  nfseInvoicesTable: {
    id: "nfse_invoices.id",
    orderId: "nfse_invoices.order_id",
    status: "nfse_invoices.status",
    rpsNumber: "nfse_invoices.rps_number",
  },
  usersTable: { role: "users.role" },
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("NFS-e completion guard", () => {
  beforeEach(() => {
    resultQueue.length = 0;
    vi.clearAllMocks();
  });

  it("does not create or submit a note before the certificate order is completed", async () => {
    resultQueue.push(
      [{ nfseAmbiente: "homologacao", nfseTokenTest: "test-token", nfsePrestadorCnpj: "123", nfsePrestadorIm: "456" }],
      [{ id: 42, status: "emitido" }],
    );

    const { emitNfseForOrder } = await import("../routes/nfse");

    await expect(emitNfseForOrder(42)).rejects.toThrow(
      "Pedido não concluído. A nota será emitida assim que o certificado estiver como concluído.",
    );
    expect(db.insert).not.toHaveBeenCalled();
  });
});