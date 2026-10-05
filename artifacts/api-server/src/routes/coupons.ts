import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, couponsTable, usersTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { CouponError, resolveOrderCoupon } from "../lib/order-coupon";

const router = Router();

function couponRow(c: typeof couponsTable.$inferSelect) {
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    value: parseFloat(c.value),
    target: c.target,
    expiresAt: c.expiresAt ?? null,
    active: c.active,
    usageLimit: c.usageLimit ?? null,
    perUserLimit: c.perUserLimit ?? null,
    usageCount: c.usageCount,
    createdAt: c.createdAt,
  };
}

router.get("/coupons", requireAdmin, async (req, res): Promise<void> => {
  const rows = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
  res.json(rows.map(couponRow));
});

router.post("/coupons", requireAdmin, async (req, res): Promise<void> => {
  const { code, type, value, target, expiresAt, active, usageLimit, perUserLimit } = req.body ?? {};
  if (!code || value === undefined || value === null) {
    res.status(400).json({ error: "Código e valor são obrigatórios." });
    return;
  }
  const existing = await db.select().from(couponsTable).where(eq(couponsTable.code, String(code).toUpperCase())).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Já existe um cupom com esse código." });
    return;
  }
  const [coupon] = await db.insert(couponsTable).values({
    code: String(code).toUpperCase().trim(),
    type: type === "fixed" ? "fixed" : "percent",
    value: String(value),
    target: ["all", "cliente", "contador"].includes(target) ? target : "all",
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    active: active !== false,
    usageLimit: usageLimit ? parseInt(usageLimit, 10) : null,
    perUserLimit: perUserLimit ? parseInt(perUserLimit, 10) : null,
  }).returning();
  res.status(201).json(couponRow(coupon));
});

router.patch("/coupons/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { code, type, value, target, expiresAt, active, usageLimit, perUserLimit } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (code !== undefined) updates.code = String(code).toUpperCase().trim();
  if (type !== undefined) updates.type = type;
  if (value !== undefined) updates.value = String(value);
  if (target !== undefined) updates.target = target;
  if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (active !== undefined) updates.active = active;
  if (usageLimit !== undefined) updates.usageLimit = usageLimit ? parseInt(usageLimit, 10) : null;
  if (perUserLimit !== undefined) updates.perUserLimit = perUserLimit ? parseInt(perUserLimit, 10) : null;

  const [coupon] = await db.update(couponsTable).set(updates as Parameters<typeof db.update>[0] extends infer T ? Record<string, unknown> : never).where(eq(couponsTable.id, id)).returning();
  if (!coupon) { res.status(404).json({ error: "Cupom não encontrado." }); return; }
  res.json(couponRow(coupon));
});

router.delete("/coupons/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(couponsTable).where(eq(couponsTable.id, id));
  res.sendStatus(204);
});

router.post("/coupons/validate", requireAuth, async (req, res): Promise<void> => {
  const { code } = req.body ?? {};
  if (!code) { res.status(400).json({ error: "Informe o código do cupom." }); return; }

  let [owner] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!)).limit(1);
  if (owner?.role === "operador" && owner.contadorId) {
    [owner] = await db.select().from(usersTable).where(eq(usersTable.id, owner.contadorId)).limit(1);
    if (owner?.role !== "contador" || owner.userType !== "contador") {
      res.status(403).json({ error: "A conta do contador responsável não está disponível." });
      return;
    }
  }
  if (!owner?.isActive || owner.role === "operador") {
    res.status(403).json({ error: "Conta responsável pelo pedido indisponível." });
    return;
  }
  try {
    const coupon = await resolveOrderCoupon(db, code, owner);
    res.json(couponRow(coupon));
  } catch (error) {
    if (error instanceof CouponError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
});

export default router;
