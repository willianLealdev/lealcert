/**
 * Web Push notification helper.
 * Uses web-push with VAPID keys stored in the settings table.
 */
import webpush from "web-push";
import { db, settingsTable, pushSubscriptionsTable } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  data?: Record<string, unknown>;
}

async function getVapidSettings() {
  const [s] = await db.select({
    vapidSubject: settingsTable.vapidSubject,
    vapidPublicKey: settingsTable.vapidPublicKey,
    vapidPrivateKey: settingsTable.vapidPrivateKey,
    siteUrl: settingsTable.siteUrl,
    logoUrl: settingsTable.logoUrl,
  }).from(settingsTable).limit(1);
  return s ?? null;
}

/**
 * Send a push notification to all subscriptions of a specific user.
 */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  const settings = await getVapidSettings();
  if (!settings?.vapidPublicKey || !settings.vapidPrivateKey || !settings.vapidSubject) {
    logger.warn({ userId }, "push: VAPID keys not configured, skipping notification");
    return;
  }

  webpush.setVapidDetails(
    settings.vapidSubject,
    settings.vapidPublicKey,
    settings.vapidPrivateKey,
  );

  const subscriptions = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  if (!subscriptions.length) return;

  const iconUrl = settings.logoUrl ?? (settings.siteUrl ? `${settings.siteUrl}/icon-192.png` : "/icon-192.png");

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? iconUrl,
    badge: payload.badge ?? iconUrl,
    tag: payload.tag,
    url: payload.url,
    data: payload.data ?? {},
  });

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        notification,
      )
    )
  );

  // Remove stale/expired subscriptions (410 Gone)
  const staleEndpoints: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      const err = result.reason as { statusCode?: number };
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        staleEndpoints.push(subscriptions[i].endpoint);
      } else {
        logger.error({ err: result.reason, userId }, "push: failed to send notification");
      }
    }
  });

  for (const endpoint of staleEndpoints) {
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
    logger.info({ endpoint }, "push: removed stale subscription");
  }

  logger.info({ userId, sent: results.filter(r => r.status === "fulfilled").length }, "push: notifications sent");
}

/**
 * Send a push notification to all admin users.
 */
export async function sendPushToAdmins(payload: PushPayload): Promise<void> {
  const settings = await getVapidSettings();
  if (!settings?.vapidPublicKey || !settings.vapidPrivateKey || !settings.vapidSubject) {
    logger.warn("push: VAPID keys not configured, skipping admin notification");
    return;
  }

  webpush.setVapidDetails(
    settings.vapidSubject,
    settings.vapidPublicKey,
    settings.vapidPrivateKey,
  );

  const admins = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"));

  if (!admins.length) return;

  const adminIds = admins.map(a => a.id);
  const subscriptions = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(inArray(pushSubscriptionsTable.userId, adminIds));

  if (!subscriptions.length) return;

  const iconUrl = settings.logoUrl ?? "/icon-192.png";
  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? iconUrl,
    badge: payload.badge ?? iconUrl,
    tag: payload.tag,
    url: payload.url,
    data: payload.data ?? {},
  });

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        notification,
      )
    )
  );

  const staleEndpoints: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      const err = result.reason as { statusCode?: number };
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        staleEndpoints.push(subscriptions[i].endpoint);
      } else {
        logger.error({ err: result.reason }, "push: failed to send admin notification");
      }
    }
  });
  for (const endpoint of staleEndpoints) {
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
  }

  logger.info({ sent: results.filter(r => r.status === "fulfilled").length }, "push: admin notifications sent");
}

/**
 * Broadcast a push notification to ALL users who have subscriptions.
 */
export async function broadcastPush(payload: PushPayload): Promise<void> {
  const settings = await getVapidSettings();
  if (!settings?.vapidPublicKey || !settings.vapidPrivateKey || !settings.vapidSubject) {
    logger.warn("push: VAPID keys not configured, skipping broadcast");
    return;
  }

  webpush.setVapidDetails(
    settings.vapidSubject,
    settings.vapidPublicKey,
    settings.vapidPrivateKey,
  );

  const subscriptions = await db.select().from(pushSubscriptionsTable);
  if (!subscriptions.length) return;

  const iconUrl = settings.logoUrl ?? "/icon-192.png";
  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? iconUrl,
    badge: payload.badge ?? iconUrl,
    tag: payload.tag,
    url: payload.url,
    data: payload.data ?? {},
  });

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        notification,
      )
    )
  );

  const staleEndpoints: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      const err = result.reason as { statusCode?: number };
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        staleEndpoints.push(subscriptions[i].endpoint);
      }
    }
  });
  for (const endpoint of staleEndpoints) {
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
  }

  logger.info({ sent: results.filter(r => r.status === "fulfilled").length, total: subscriptions.length }, "push: broadcast sent");
}
