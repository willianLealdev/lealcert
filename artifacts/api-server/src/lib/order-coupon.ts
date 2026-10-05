import { and, count, eq } from "drizzle-orm";
import { db, couponsTable, ordersTable } from "@workspace/db";
import { moneyCents } from "./lealplus-pricing";

export class CouponError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type CouponDb = Pick<typeof db, "select">;
type CouponOwner = { id: number; role: string; userType: string | null };

/** Revalida no momento da compra; lock protege limites e consumo no mesmo commit do pedido. */
export async function resolveOrderCoupon(
  queryDb: CouponDb, code: unknown, owner: CouponOwner, lock = false,
) {
  if (typeof code !== "string" || !code.trim()) throw new CouponError("Informe o código do cupom.");
  const query = queryDb.select().from(couponsTable)
    .where(eq(couponsTable.code, code.trim().toUpperCase())).limit(1);
  const [coupon] = await (lock ? query.for("update") : query);
  if (!coupon?.active) throw new CouponError("Cupom inválido ou inativo.", 404);
  if (coupon.expiresAt && coupon.expiresAt <= new Date()) throw new CouponError("Cupom expirado.", 410);
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    throw new CouponError("Cupom esgotado.", 410);
  }
  const isContador = owner.role === "contador" && owner.userType === "contador";
  if (owner.role !== "admin" && coupon.target !== "all") {
    if (coupon.target === "contador" && !isContador) throw new CouponError("Este cupom é exclusivo para contadores.", 403);
    if (coupon.target === "cliente" && isContador) throw new CouponError("Este cupom é exclusivo para clientes.", 403);
  }
  if (coupon.perUserLimit !== null) {
    const [{ used }] = await queryDb.select({ used: count() }).from(ordersTable)
      .where(and(eq(ordersTable.userId, owner.id), eq(ordersTable.couponId, coupon.id)));
    if (Number(used) >= coupon.perUserLimit) throw new CouponError("Você já atingiu o limite de uso deste cupom.", 410);
  }
  return coupon;
}

/** Mesma base do checkout público: desconto no certificado, adicional cobrado separadamente. */
export function orderCouponDiscount(basePrice: number, coupon: { type: string; value: string }): number {
  const baseCents = moneyCents(basePrice);
  const value = Number(coupon.value);
  if (!Number.isFinite(value) || value < 0) throw new CouponError("Valor do cupom inválido.");
  const discountCents = coupon.type === "percent"
    ? Math.round(baseCents * value / 100)
    : moneyCents(coupon.value);
  return Math.min(baseCents, discountCents) / 100;
}
