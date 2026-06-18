import { Router } from "express";
import { db, settingsTable } from "@workspace/db";

const router = Router();

// ── GET /branding (public — no auth required) ─────────────────────────────
// Returns safe public branding info used by login page and app layout.
router.get("/branding", async (_req, res): Promise<void> => {
  const rows = await db.select({
    appName: settingsTable.appName,
    logoUrl: settingsTable.logoUrl,
    primaryColor: settingsTable.primaryColor,
    siteUrl: settingsTable.siteUrl,
    contactPhone: settingsTable.contactPhone,
    contactWhatsapp: settingsTable.contactWhatsapp,
    contactEmailSupport: settingsTable.contactEmailSupport,
    contactAddress: settingsTable.contactAddress,
  }).from(settingsTable).limit(1);

  const s = rows[0];
  res.json({
    appName: s?.appName ?? "LealCert",
    logoUrl: s?.logoUrl ?? null,
    primaryColor: s?.primaryColor ?? "#2563eb",
    siteUrl: s?.siteUrl ?? null,
    contactPhone: s?.contactPhone ?? null,
    contactWhatsapp: s?.contactWhatsapp ?? null,
    contactEmailSupport: s?.contactEmailSupport ?? null,
    contactAddress: s?.contactAddress ?? null,
  });
});

export default router;
