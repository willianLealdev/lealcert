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
    garApiKey: s.garApiKey,
    garHashVendedor: s.garHashVendedor,
    garHashTabela: s.garHashTabela,
    garFormaPagamento: s.garFormaPagamento ?? "11",
    garPreferirVideoconferencia: s.garPreferirVideoconferencia ?? "1",
    safewebUrl: s.safewebUrl,
    safewebUrlHomologacao: s.safewebUrlHomologacao,
    safewebAmbiente: s.safewebAmbiente ?? "producao",
    safewebUsername: s.safewebUsername,
    safewebPassword: s.safewebPassword,
    safewebCnpjAr: s.safewebCnpjAr,
    safewebCodigoParceiro: s.safewebCodigoParceiro,
    activeProvider: s.activeProvider ?? "gestaoar",
    evolutionUrl: s.evolutionUrl,
    evolutionApiKey: s.evolutionApiKey,
    evolutionInstance: s.evolutionInstance,
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
    garApiKey, garHashVendedor, garHashTabela, garFormaPagamento, garPreferirVideoconferencia,
    safewebUrl, safewebUrlHomologacao, safewebAmbiente, safewebUsername, safewebPassword, safewebCnpjAr, safewebCodigoParceiro, activeProvider,
    evolutionUrl, evolutionApiKey, evolutionInstance,
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
  if (garApiKey !== undefined) updates.garApiKey = garApiKey;
  if (garHashVendedor !== undefined) updates.garHashVendedor = garHashVendedor;
  if (garHashTabela !== undefined) updates.garHashTabela = garHashTabela;
  if (garFormaPagamento !== undefined) updates.garFormaPagamento = garFormaPagamento;
  if (garPreferirVideoconferencia !== undefined) updates.garPreferirVideoconferencia = garPreferirVideoconferencia;
  if (safewebUrl !== undefined) updates.safewebUrl = safewebUrl;
  if (safewebUrlHomologacao !== undefined) updates.safewebUrlHomologacao = safewebUrlHomologacao;
  if (safewebAmbiente !== undefined) updates.safewebAmbiente = safewebAmbiente;
  if (safewebUsername !== undefined) updates.safewebUsername = safewebUsername;
  if (safewebPassword !== undefined) updates.safewebPassword = safewebPassword;
  if (safewebCnpjAr !== undefined) updates.safewebCnpjAr = safewebCnpjAr;
  if (safewebCodigoParceiro !== undefined) updates.safewebCodigoParceiro = safewebCodigoParceiro;
  if (activeProvider !== undefined) updates.activeProvider = activeProvider;
  if (evolutionUrl !== undefined) updates.evolutionUrl = evolutionUrl;
  if (evolutionApiKey !== undefined) updates.evolutionApiKey = evolutionApiKey;
  if (evolutionInstance !== undefined) updates.evolutionInstance = evolutionInstance;

  const [updated] = await db
    .update(settingsTable)
    .set(updates as Parameters<typeof db.update>[0] extends infer T ? Record<string, unknown> : never)
    .where(eq(settingsTable.id, s.id))
    .returning();

  res.json(serializeSettings(updated));
});

export default router;
