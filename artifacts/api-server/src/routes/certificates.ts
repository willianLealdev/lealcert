import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, certificatesTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

function certRow(c: typeof certificatesTable.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    price: parseFloat(c.price),
    active: c.active,
    garHashProduto: c.garHashProduto ?? null,
    createdAt: c.createdAt,
  };
}

router.get("/certificates", async (req, res): Promise<void> => {
  const { activeOnly } = req.query;
  const rows = await db.select().from(certificatesTable).orderBy(certificatesTable.id);
  const result = activeOnly === "true" ? rows.filter(r => r.active) : rows;
  res.json(result.map(certRow));
});

router.post("/certificates", requireAdmin, async (req, res): Promise<void> => {
  const { name, description, price, active, garHashProduto } = req.body ?? {};
  if (!name || price === undefined) {
    res.status(400).json({ error: "Nome e preço são obrigatórios." });
    return;
  }
  const [cert] = await db.insert(certificatesTable).values({
    name,
    description: description || null,
    price: String(price),
    active: active !== false,
    garHashProduto: garHashProduto || null,
  }).returning();
  res.status(201).json(certRow(cert));
});

router.patch("/certificates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, description, price, active, garHashProduto } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (price !== undefined) updates.price = String(price);
  if (active !== undefined) updates.active = active;
  if (garHashProduto !== undefined) updates.garHashProduto = garHashProduto || null;

  const [cert] = await db
    .update(certificatesTable)
    .set(updates as Parameters<typeof db.update>[0] extends infer T ? Record<string, unknown> : never)
    .where(eq(certificatesTable.id, id))
    .returning();
  if (!cert) {
    res.status(404).json({ error: "Modelo não encontrado." });
    return;
  }
  res.json(certRow(cert));
});

router.delete("/certificates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(certificatesTable).where(eq(certificatesTable.id, id));
  res.sendStatus(204);
});

export default router;
