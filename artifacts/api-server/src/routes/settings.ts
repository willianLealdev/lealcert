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

router.get("/settings", requireAdmin, async (_req, res): Promise<void> => {
  const s = await getOrCreateSettings();
  res.json({
    id: s.id,
    appName: s.appName,
    mpAccessToken: s.mpAccessToken,
    mpPublicKey: s.mpPublicKey,
    webhookSecret: s.webhookSecret,
    mailFrom: s.mailFrom,
    siteUrl: s.siteUrl,
    updatedAt: s.updatedAt,
  });
});

router.patch("/settings", requireAdmin, async (req, res): Promise<void> => {
  const s = await getOrCreateSettings();
  const { appName, mpAccessToken, mpPublicKey, webhookSecret, mailFrom, siteUrl } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (appName !== undefined) updates.appName = appName;
  if (mpAccessToken !== undefined) updates.mpAccessToken = mpAccessToken;
  if (mpPublicKey !== undefined) updates.mpPublicKey = mpPublicKey;
  if (webhookSecret !== undefined) updates.webhookSecret = webhookSecret;
  if (mailFrom !== undefined) updates.mailFrom = mailFrom;
  if (siteUrl !== undefined) updates.siteUrl = siteUrl;

  const [updated] = await db
    .update(settingsTable)
    .set(updates as Parameters<typeof db.update>[0] extends infer T ? Record<string, unknown> : never)
    .where(eq(settingsTable.id, s.id))
    .returning();
  res.json({
    id: updated.id,
    appName: updated.appName,
    mpAccessToken: updated.mpAccessToken,
    mpPublicKey: updated.mpPublicKey,
    webhookSecret: updated.webhookSecret,
    mailFrom: updated.mailFrom,
    siteUrl: updated.siteUrl,
    updatedAt: updated.updatedAt,
  });
});

export default router;
