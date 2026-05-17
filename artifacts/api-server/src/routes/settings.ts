import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

async function getOrCreateSettings() {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [s] = await db.insert(settingsTable).values({ appName: "LealCert" }).returning();
  return s;
}

function serializeSettings(s: typeof settingsTable.$inferSelect) {
  return {
    id: s.id,
    appName: s.appName,
    mpAccessToken: s.mpAccessToken,
    mpPublicKey: s.mpPublicKey,
    webhookSecret: s.webhookSecret,
    mailFrom: s.mailFrom,
    siteUrl: s.siteUrl,
    scheduleOpenDays: s.scheduleOpenDays ?? "1,2,3,4,5",
    scheduleOpenHour: s.scheduleOpenHour ?? "9",
    scheduleCloseHour: s.scheduleCloseHour ?? "18",
    scheduleStepMin: s.scheduleStepMin ?? "60",
    scheduleClosedDates: s.scheduleClosedDates ?? "",
    updatedAt: s.updatedAt,
  };
}

router.get("/settings", requireAdmin, async (_req, res): Promise<void> => {
  const s = await getOrCreateSettings();
  res.json(serializeSettings(s));
});

router.patch("/settings", requireAdmin, async (req, res): Promise<void> => {
  const s = await getOrCreateSettings();
  const {
    appName, mpAccessToken, mpPublicKey, webhookSecret, mailFrom, siteUrl,
    scheduleOpenDays, scheduleOpenHour, scheduleCloseHour, scheduleStepMin, scheduleClosedDates,
  } = req.body ?? {};

  const updates: Record<string, unknown> = {};
  if (appName !== undefined) updates.appName = appName;
  if (mpAccessToken !== undefined) updates.mpAccessToken = mpAccessToken;
  if (mpPublicKey !== undefined) updates.mpPublicKey = mpPublicKey;
  if (webhookSecret !== undefined) updates.webhookSecret = webhookSecret;
  if (mailFrom !== undefined) updates.mailFrom = mailFrom;
  if (siteUrl !== undefined) updates.siteUrl = siteUrl;
  if (scheduleOpenDays !== undefined) updates.scheduleOpenDays = scheduleOpenDays;
  if (scheduleOpenHour !== undefined) updates.scheduleOpenHour = scheduleOpenHour;
  if (scheduleCloseHour !== undefined) updates.scheduleCloseHour = scheduleCloseHour;
  if (scheduleStepMin !== undefined) updates.scheduleStepMin = scheduleStepMin;
  if (scheduleClosedDates !== undefined) updates.scheduleClosedDates = scheduleClosedDates;

  const [updated] = await db
    .update(settingsTable)
    .set(updates as Parameters<typeof db.update>[0] extends infer T ? Record<string, unknown> : never)
    .where(eq(settingsTable.id, s.id))
    .returning();

  res.json(serializeSettings(updated));
});

export default router;
