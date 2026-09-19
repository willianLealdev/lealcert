import { Router } from "express";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db, discagemCallsTable, discagemCampaignsTable, settingsTable } from "@workspace/db";
import { getDiscagemSettings } from "../lib/discagem/settings-reader";
import { preGenerateOpening } from "../lib/discagem/opening-pregenerate";
import { initiateCall } from "../lib/discagem/twilio-client";
import { startScheduler } from "../lib/discagem/scheduler";
import { runAgentTurn } from "../lib/discagem/ai-agent";
import { sendWhatsApp } from "../lib/evolution";

const router = Router();

function idParam(value: string | string[]): number {
  return Number(Array.isArray(value) ? value[0] : value);
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if (digits.length >= 12) return `+${digits}`;
  return `+55${digits}`;
}

function parseTranscript(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function callResponse(
  call: typeof discagemCallsTable.$inferSelect,
  campaign?: typeof discagemCampaignsTable.$inferSelect | null,
) {
  return {
    id: call.id,
    campaignId: call.campaignId,
    campaignName: campaign?.name ?? null,
    contactId: call.contactId,
    contactName: call.contactName,
    phoneNumber: call.phoneNumber,
    status: call.status,
    outcome: call.outcome,
    interestStatus: call.interestStatus,
    endReason: call.endReason,
    transcript: parseTranscript(call.transcript),
    promptUsed: call.systemPromptUsed,
    aiSource: call.aiSource ?? call.aiModelUsed,
    aiSummary: call.aiSummary,
    whatsappSent: !!call.whatsappSentAt,
    whatsappSentAt: call.whatsappSentAt,
    callbackAt: call.callbackAt,
    humanTask: call.humanTask,
    durationSeconds: call.durationSeconds,
    recordingUrl: call.recordingUrl,
    attemptNumber: call.attemptNumber,
    error: call.error,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    createdAt: call.createdAt,
    campaign: campaign ? {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      agentName: campaign.agentName,
      aiModel: campaign.aiModel,
      ttsProvider: campaign.ttsProvider,
    } : null,
  };
}

router.get("/telephony/calls", async (req, res): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const campaignId = Number(req.query.campaignId);
  const conditions = [];
  if (status) conditions.push(eq(discagemCallsTable.status, status));
  if (search) conditions.push(ilike(discagemCallsTable.contactName, `%${search}%`));
  if (Number.isInteger(campaignId) && campaignId > 0) conditions.push(eq(discagemCallsTable.campaignId, campaignId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db.select({ call: discagemCallsTable, campaign: discagemCampaignsTable })
    .from(discagemCallsTable)
    .leftJoin(discagemCampaignsTable, eq(discagemCampaignsTable.id, discagemCallsTable.campaignId))
    .where(where)
    .orderBy(desc(discagemCallsTable.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
    .from(discagemCallsTable).where(where);
  res.json({ page, limit, total, calls: rows.map(row => callResponse(row.call, row.campaign)) });
});

router.get("/telephony/calls/:id", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido." }); return; }
  const [row] = await db.select({ call: discagemCallsTable, campaign: discagemCampaignsTable })
    .from(discagemCallsTable)
    .leftJoin(discagemCampaignsTable, eq(discagemCampaignsTable.id, discagemCallsTable.campaignId))
    .where(eq(discagemCallsTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "Ligação não encontrada." }); return; }
  res.json(callResponse(row.call, row.campaign));
});

router.post("/telephony/calls/start", async (req, res): Promise<void> => {
  const { phoneNumber: rawPhone, contactName, contactId, aiModel, agentName, ttsProvider, ttsVoiceId } = req.body ?? {};
  if (typeof rawPhone !== "string" || rawPhone.replace(/\D/g, "").length < 10) {
    res.status(400).json({ error: "Informe um telefone válido." }); return;
  }
  const phoneNumber = normalizePhone(rawPhone);
  const cfg = await getDiscagemSettings();
  const [campaign] = await db.insert(discagemCampaignsTable).values({
    name: `API externa ${new Date().toISOString()}`,
    status: "running",
    targetType: "manual_number",
    manualNumber: phoneNumber,
    aiModel: aiModel ?? "deepseek",
    agentName: agentName ?? "Willian",
    ttsProvider: ttsProvider ?? cfg.ttsFallback[0] ?? "cartesia",
    ttsVoiceId: ttsVoiceId ?? null,
    maxConcurrentCalls: 1,
    maxAttempts: 1,
  }).returning();
  const [call] = await db.insert(discagemCallsTable).values({
    campaignId: campaign.id,
    contactId: Number.isInteger(Number(contactId)) ? Number(contactId) : null,
    phoneNumber,
    contactName: typeof contactName === "string" ? contactName.trim() : "Ligação via API",
    status: "queued",
  }).returning();
  try {
    await preGenerateOpening(call.id, campaign);
    const twilioCallSid = await initiateCall({
      to: phoneNumber,
      callbackBaseUrl: `${cfg.publicHostname || process.env.PUBLIC_HOSTNAME || ""}/api/discagem`,
      callId: call.id,
      campaignId: campaign.id,
    });
    const [updated] = await db.update(discagemCallsTable)
      .set({ twilioCallSid, status: "dialing", startedAt: new Date() })
      .where(eq(discagemCallsTable.id, call.id)).returning();
    res.status(201).json(callResponse(updated, campaign));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(discagemCallsTable).set({ status: "failed", error: message, endedAt: new Date() })
      .where(eq(discagemCallsTable.id, call.id));
    res.status(502).json({ error: message, callId: call.id });
  }
});

router.post("/telephony/campaigns/:id/pause", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const [campaign] = await db.update(discagemCampaignsTable).set({
    status: "paused",
    pauseReason: typeof req.body?.reason === "string" ? req.body.reason.slice(0, 500) : "Pausado pela API externa",
    pausedApi: "EXTERNAL_API",
  }).where(eq(discagemCampaignsTable.id, id)).returning();
  if (!campaign) { res.status(404).json({ error: "Campanha não encontrada." }); return; }
  res.json({ ok: true, campaignId: id, status: campaign.status });
});

router.post("/telephony/campaigns/:id/resume", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const [campaign] = await db.update(discagemCampaignsTable).set({
    status: "running", pauseReason: null, pausedApi: null,
  }).where(eq(discagemCampaignsTable.id, id)).returning();
  if (!campaign) { res.status(404).json({ error: "Campanha não encontrada." }); return; }
  startScheduler();
  res.json({ ok: true, campaignId: id, status: campaign.status });
});

router.patch("/telephony/calls/:id/commercial", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const { status, interestStatus, endReason, summary, callbackAt, humanTask } = req.body ?? {};
  const allowedStatuses = ["queued", "dialing", "in_progress", "answered", "voicemail", "no_answer", "failed", "optout", "busy"];
  const allowedInterest = ["unknown", "interested", "not_interested"];
  if (status !== undefined && !allowedStatuses.includes(status)) {
    res.status(400).json({ error: "Status inválido." }); return;
  }
  if (interestStatus !== undefined && !allowedInterest.includes(interestStatus)) {
    res.status(400).json({ error: "Situação de interesse inválida." }); return;
  }
  const callbackDate = callbackAt ? new Date(callbackAt) : null;
  if (callbackAt && Number.isNaN(callbackDate?.getTime())) {
    res.status(400).json({ error: "Data de retorno inválida." }); return;
  }
  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (interestStatus !== undefined) updates.interestStatus = interestStatus;
  if (endReason !== undefined) updates.endReason = endReason ? String(endReason).slice(0, 1_000) : null;
  if (summary !== undefined) updates.aiSummary = summary ? String(summary).slice(0, 5_000) : null;
  if (callbackAt !== undefined) updates.callbackAt = callbackDate;
  if (humanTask !== undefined) updates.humanTask = humanTask ? String(humanTask).slice(0, 2_000) : null;
  const [call] = await db.update(discagemCallsTable).set(updates)
    .where(eq(discagemCallsTable.id, id)).returning();
  if (!call) { res.status(404).json({ error: "Ligação não encontrada." }); return; }
  res.json(callResponse(call));
});

router.post("/telephony/calls/:id/whatsapp", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) { res.status(400).json({ error: "Informe a mensagem." }); return; }
  const [call] = await db.select().from(discagemCallsTable).where(eq(discagemCallsTable.id, id)).limit(1);
  if (!call) { res.status(404).json({ error: "Ligação não encontrada." }); return; }
  const [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings?.evolutionUrl || !settings.evolutionApiKey || !settings.evolutionInstance) {
    res.status(503).json({ error: "Evolution API não configurada." }); return;
  }
  await sendWhatsApp({
    evolutionUrl: settings.evolutionUrl,
    evolutionApiKey: settings.evolutionApiKey,
    evolutionInstance: settings.evolutionInstance,
  }, call.phoneNumber, message);
  const sentAt = new Date();
  await db.update(discagemCallsTable).set({ whatsappSentAt: sentAt })
    .where(eq(discagemCallsTable.id, id));
  res.json({ ok: true, callId: id, sentAt });
});

router.post("/telephony/calls/:id/summarize", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const [call] = await db.select().from(discagemCallsTable).where(eq(discagemCallsTable.id, id)).limit(1);
  if (!call) { res.status(404).json({ error: "Ligação não encontrada." }); return; }
  const transcript = parseTranscript(call.transcript);
  if (transcript.length === 0) { res.status(400).json({ error: "A ligação não possui transcrição." }); return; }
  const prompt = "Resuma esta ligação comercial em português, em até 5 frases. Informe interesse, objeções, próximo passo e motivo do encerramento. Não use comandos internos.";
  const result = await runAgentTurn([
    { role: "user", text: JSON.stringify(transcript), ts: new Date().toISOString() },
  ], "deepseek", "Analista", prompt, undefined, false);
  await db.update(discagemCallsTable).set({ aiSummary: result.text }).where(eq(discagemCallsTable.id, id));
  res.json({ callId: id, summary: result.text });
});

export default router;