import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const results: Row[][] = [];
const writes: Array<{ kind: "commission" | "usage" | "order"; values: unknown }> = [];

function chain(result: Row[] = []) {
  const value: Record<string, unknown> & PromiseLike<Row[]> = {
    from: () => value,
    innerJoin: () => value,
    leftJoin: () => value,
    where: () => value,
    limit: (count: number) => Promise.resolve(result.slice(0, count)),
    values: (input: unknown) => {
      writes.push({ kind: "commission", values: input });
      return value;
    },
    onConflictDoNothing: () => Promise.resolve(),
    set: (input: unknown) => {
      writes.push({ kind: "order", values: input });
      return value;
    },
    execute: () => Promise.resolve(),
    then: <TResult1 = Row[], TResult2 = never>(
      resolve?: ((rows: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(resolve, reject ?? undefined) as PromiseLike<TResult1 | TResult2>,
  };
  return value;
}

const db = {
  select: vi.fn(() => chain(results.shift() ?? [])),
  insert: vi.fn(() => chain()),
  update: vi.fn(() => chain()),
  execute: vi.fn(),
  transaction: vi.fn(async (callback: (tx: typeof db) => Promise<void>) => callback(db)),
};

vi.mock("@workspace/db", () => ({
  db,
  usersTable: {
    id: "users.id", role: "users.role", userType: "users.user_type",
    referredByUserId: "users.referred_by_user_id", contadorId: "users.contador_id",
    isActive: "users.is_active", referralCode: "users.referral_code",
  },
  ordersTable: { id: "orders.id", userId: "orders.user_id", status: "orders.status", total: "orders.total", paymentMethod: "orders.payment_method", referralCreditUsed: "orders.referral_credit_used" },
  referralCreditCommissionsTable: { id: "commissions.id", orderId: "commissions.order_id", amount: "commissions.amount", referrerUserId: "commissions.referrer_user_id", referredUserId: "commissions.referred_user_id" },
  referralCreditUsagesTable: { id: "usages.id", orderId: "usages.order_id", amount: "usages.amount", ownerUserId: "usages.owner_user_id" },
}));

vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

describe("referral credit rules", () => {
  beforeEach(() => {
    results.length = 0;
    writes.length = 0;
    vi.clearAllMocks();
  });

  it("does not grant a credit before an indicated accountant order is completed", async () => {
    results.push([{
      order: { id: 31, status: "paid" },
      referredByUserId: 9,
      referredUserType: "contador",
      referredRole: "contador",
    }]);
    const { creditReferralForCompletedOrder } = await import("../lib/referrals");

    await creditReferralForCompletedOrder(31);

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("grants exactly one R$2 credit when an indicated accountant order is completed", async () => {
    results.push([{
      order: { id: 31, status: "completed", userId: 10 },
      referredByUserId: 9,
      referredUserType: "contador",
      referredRole: "contador",
    }]);
    const { creditReferralForCompletedOrder } = await import("../lib/referrals");

    await creditReferralForCompletedOrder(31);

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(writes).toContainEqual({
      kind: "commission",
      values: { referrerUserId: 9, referredUserId: 10, orderId: 31, amount: "2" },
    });
  });

  it("rejects credit redemption when the order belongs to another office", async () => {
    // A real SQL WHERE clause scopes by ownerUserId. The mocked query returns
    // no row for an order outside of the office, mirroring that database result.
    results.push([]);
    const { redeemReferralCredits } = await import("../lib/referrals");

    await expect(redeemReferralCredits(12, 88)).rejects.toThrow("Pedido não encontrado para esta conta.");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects credit redemption when the office balance is below R$90", async () => {
    results.push(
      [{ id: 88, userId: 12, status: "pending_payment", total: "90.00" }],
      [{ value: "89.00" }],
      [{ value: "0.00" }],
    );
    const { redeemReferralCredits } = await import("../lib/referrals");

    await expect(redeemReferralCredits(12, 88)).rejects.toThrow("Saldo insuficiente");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a duplicate redemption after the order is no longer pending", async () => {
    results.push([{ id: 88, userId: 12, status: "paid", total: "90.00" }]);
    const { redeemReferralCredits } = await import("../lib/referrals");

    await expect(redeemReferralCredits(12, 88)).rejects.toThrow("não pode usar créditos");
    expect(db.insert).not.toHaveBeenCalled();
  });
});