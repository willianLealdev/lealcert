import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, slotsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

router.get("/slots", async (req, res): Promise<void> => {
  const rows = await db.select().from(slotsTable)
    .where(eq(slotsTable.active, true))
    .orderBy(slotsTable.slotDatetime);
  res.json(rows.map(s => ({
    id: s.id,
    slotDatetime: s.slotDatetime,
    active: s.active,
  })));
});

router.post("/slots", requireAdmin, async (req, res): Promise<void> => {
  const { slotDatetime, active } = req.body ?? {};
  if (!slotDatetime) {
    res.status(400).json({ error: "Data/hora do slot é obrigatória." });
    return;
  }
  const [slot] = await db.insert(slotsTable).values({
    slotDatetime: new Date(slotDatetime),
    active: active !== false,
  }).returning();
  res.status(201).json({ id: slot.id, slotDatetime: slot.slotDatetime, active: slot.active });
});

router.delete("/slots/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(slotsTable).where(eq(slotsTable.id, id));
  res.sendStatus(204);
});

export default router;
