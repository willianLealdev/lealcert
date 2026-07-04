import { Router } from "express";
import { db, settingsTable } from "@workspace/db";

const router = Router();

// ── GET /branding (public — no auth required) ─────────────────────────────
// Returns safe UI/branding fields. Infrastructure fields (activeProvider,
// safewebAmbiente) are included only for authenticated sessions.
router.get("/branding", async (req, res): Promise<void> => {
  const session = req.session as unknown as Record<string, unknown>;
  const isAuthenticated = Boolean(session?.userId);

  const rows = await db.select({
    appName: settingsTable.appName,
    logoUrl: settingsTable.logoUrl,
    primaryColor: settingsTable.primaryColor,
    siteUrl: settingsTable.siteUrl,
    contactPhone: settingsTable.contactPhone,
    contactWhatsapp: settingsTable.contactWhatsapp,
    contactEmailSupport: settingsTable.contactEmailSupport,
    contactAddress: settingsTable.contactAddress,
    safewebAmbiente: settingsTable.safewebAmbiente,
    activeProvider: settingsTable.activeProvider,
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
    // Only exposed to authenticated users — omitted for unauthenticated public access
    ...(isAuthenticated && {
      safewebAmbiente: s?.safewebAmbiente ?? null,
      activeProvider: s?.activeProvider ?? "gestaoar",
    }),
  });
});

export default router;
