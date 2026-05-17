import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, slotsTable, settingsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

const BRT = "America/Sao_Paulo";

function dateToBRTKey(d: Date) {
  return d.toLocaleDateString("sv-SE", { timeZone: BRT });
}

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

router.post("/slots/generate", requireAdmin, async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.body ?? {};
  if (!dateFrom || !dateTo) {
    res.status(400).json({ error: "dateFrom e dateTo são obrigatórios." });
    return;
  }

  const rows = await db.select().from(settingsTable).limit(1);
  const cfg = rows[0];

  const openDays = (cfg?.scheduleOpenDays ?? "1,2,3,4,5").split(",").map(Number).filter(Boolean);
  const openHour = parseInt(cfg?.scheduleOpenHour ?? "9", 10);
  const closeHour = parseInt(cfg?.scheduleCloseHour ?? "18", 10);
  const stepMin = parseInt(cfg?.scheduleStepMin ?? "60", 10);
  const closedDates = (cfg?.scheduleClosedDates ?? "").split(",").map(s => s.trim()).filter(Boolean);

  const from = new Date(dateFrom + "T12:00:00");
  const to = new Date(dateTo + "T12:00:00");

  let created = 0;
  let skipped = 0;

  const current = new Date(from);
  while (current <= to) {
    const dateKey = dateToBRTKey(current);
    const dow = current.getDay(); // 0=Sun,1=Mon,...,6=Sat
    const isoDay = dow === 0 ? 7 : dow; // 1=Mon,...,7=Sun

    if (openDays.includes(isoDay) && !closedDates.includes(dateKey)) {
      for (let totalMin = openHour * 60; totalMin <= closeHour * 60; totalMin += stepMin) {
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        const dtStr = `${dateKey}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000-03:00`;
        const slotDatetime = new Date(dtStr);

        try {
          await db.insert(slotsTable).values({ slotDatetime, active: true });
          created++;
        } catch {
          skipped++;
        }
      }
    }

    current.setDate(current.getDate() + 1);
  }

  res.json({ created, skipped });
});

router.delete("/slots/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(slotsTable).where(eq(slotsTable.id, id));
  res.sendStatus(204);
});

export default router;
