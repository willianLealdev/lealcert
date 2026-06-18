/**
 * Push notification endpoints:
 *   GET  /push/public-key          — returns VAPID public key (no auth)
 *   POST /push/subscribe           — save a push subscription (authenticated)
 *   POST /push/unsubscribe         — remove a push subscription (authenticated)
 *   POST /push/test                — send a test push (admin only)
 */
import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, settingsTable, pushSubscriptionsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { sendPushToUser } from "../lib/push";

const router = Router();

// ── Public key ──────────────────────────────────────────────────────────────
router.get("/push/public-key", async (_req, res): Promise<void> => {
  const [s] = await db.select({ vapidPublicKey: settingsTable.vapidPublicKey }).from(settingsTable).limit(1);
  if (!s?.vapidPublicKey) {
    res.status(503).json({ error: "VAPID public key not configured" });
    return;
  }
  res.json({ publicKey: s.vapidPublicKey });
});

// ── Subscribe ────────────────────────────────────────────────────────────────
router.post("/push/subscribe", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { endpoint, keys } = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!endpoint || !keys?.p256dh || !keys.auth) {
    res.status(400).json({ error: "endpoint and keys (p256dh, auth) are required" });
    return;
  }

  try {
    await db
      .insert(pushSubscriptionsTable)
      .values({
        userId: req.session.userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: { userId: req.session.userId, p256dh: keys.p256dh, auth: keys.auth },
      });

    logger.info({ userId: req.session.userId, endpoint }, "push: subscription saved");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "push: failed to save subscription");
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

// ── Unsubscribe ──────────────────────────────────────────────────────────────
router.post("/push/unsubscribe", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) { res.status(400).json({ error: "endpoint is required" }); return; }

  await db
    .delete(pushSubscriptionsTable)
    .where(and(
      eq(pushSubscriptionsTable.endpoint, endpoint),
      eq(pushSubscriptionsTable.userId, req.session.userId),
    ));

  res.json({ ok: true });
});

// ── Test (admin) ─────────────────────────────────────────────────────────────
router.post("/push/test", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const user = req.session as { userId: number; role?: string };
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const { title = "Teste de Notificação", body = "Notificações push estão funcionando!" } = req.body as { title?: string; body?: string };

  try {
    await sendPushToUser(req.session.userId, { title, body, tag: "test" });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "push/test: error");
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
