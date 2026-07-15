import { Router } from "express";
import { db, marketingContactsTable, whatsappCampaignsTable, whatsappSendsTable, settingsTable } from "@workspace/db";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendWhatsApp } from "../lib/evolution";

const router = Router();

// ── In-memory pause set ──────────────────────────────────────────────────────
const pausedWaCampaigns = new Set<number>();

// ── Business hours helper ────────────────────────────────────────────────────
function isWithinBusinessHoursWa(startHour: number, endHour: number, days?: string): boolean {
  const now = new Date();
  const brt = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const hour = brt.getHours();
  const day = brt.getDay();
  if (days) {
    const allowed = days.split(",").map(Number);
    if (!allowed.includes(day)) return false;
  }
  return hour >= startHour && hour < endHour;
}

// ── Auto-resume scheduler (every 60 s) ──────────────────────────────────────
setInterval(async () => {
  try {
    const paused = await db
      .select({
        id: whatsappCampaignsTable.id,
        startHour: whatsappCampaignsTable.sendStartHour,
        endHour: whatsappCampaignsTable.sendEndHour,
        days: whatsappCampaignsTable.sendDays,
      })
      .from(whatsappCampaignsTable)
      .where(eq(whatsappCampaignsTable.status, "paused"));

    for (const c of paused) {
      if (c.startHour == null || c.endHour == null) continue;
      if (!isWithinBusinessHoursWa(c.startHour, c.endHour, c.days ?? undefined)) continue;
      pausedWaCampaigns.delete(c.id);
      await db
        .update(whatsappCampaignsTable)
        .set({ status: "sending" })
        .where(eq(whatsappCampaignsTable.id, c.id));
      dispatchWaCampaign(c.id).catch((err) =>
        logger.error({ campaignId: c.id, err }, "WA auto-resume dispatch error"),
      );
      logger.info({ campaignId: c.id }, "WA: campanha retomada automaticamente (horário comercial)");
    }
  } catch (err) {
    logger.warn({ err }, "WA business-hours scheduler error");
  }
}, 60_000);

// ── Scheduled campaign poller (every 60 s) ───────────────────────────────────
setInterval(async () => {
  try {
    const now = new Date();
    const scheduled = await db
      .select()
      .from(whatsappCampaignsTable)
      .where(eq(whatsappCampaignsTable.status, "scheduled"));

    for (const c of scheduled) {
      if (!c.scheduledAt || c.scheduledAt > now) continue;
      await db
        .update(whatsappCampaignsTable)
        .set({ status: "sending", totalSent: 0, totalFailed: 0 })
        .where(eq(whatsappCampaignsTable.id, c.id));
      dispatchWaCampaign(c.id, {
        targetOverride: c.scheduledTargetOverride ?? undefined,
        sendPerMinute: c.sendPerMinute ?? undefined,
        sendStartHour: c.sendStartHour ?? undefined,
        sendEndHour: c.sendEndHour ?? undefined,
        sendDays: c.sendDays ?? undefined,
      }).catch((err) => logger.error({ campaignId: c.id, err }, "WA scheduled dispatch error"));
    }
  } catch (err) {
    logger.warn({ err }, "WA scheduled-campaign poller error");
  }
}, 60_000);

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

// GET /marketing/wa/campaigns
router.get("/marketing/wa/campaigns", async (req, res): Promise<void> => {
  if (req.session.role !== "admin") {
    res.status(403).json({ error: "Acesso negado." });
    return;
  }
  const campaigns = await db
    .select()
    .from(whatsappCampaignsTable)
    .orderBy(desc(whatsappCampaignsTable.createdAt));
  res.json(campaigns);
});

// POST /marketing/wa/campaigns
router.post("/marketing/wa/campaigns", async (req, res): Promise<void> => {
  if (req.session.role !== "admin") {
    res.status(403).json({ error: "Acesso negado." });
    return;
  }
  const { name, message } = req.body ?? {};
  if (!name?.trim() || !message?.trim()) {
    res.status(400).json({ error: "Nome e mensagem são obrigatórios." });
    return;
  }
  const [campaign] = await db
    .insert(whatsappCampaignsTable)
    .values({ name: name.trim(), message: message.trim() })
    .returning();
  res.json(campaign!);
});

// PUT /marketing/wa/campaigns/:id
router.put("/marketing/wa/campaigns/:id", async (req, res): Promise<void> => {
  if (req.session.role !== "admin") {
    res.status(403).json({ error: "Acesso negado." });
    return;
  }
  const id = parseInt(req.params.id, 10);
  const { name, message } = req.body ?? {};
  if (!name?.trim() || !message?.trim()) {
    res.status(400).json({ error: "Nome e mensagem são obrigatórios." });
    return;
  }
  const [campaign] = await db
    .update(whatsappCampaignsTable)
    .set({ name: name.trim(), message: message.trim() })
    .where(eq(whatsappCampaignsTable.id, id))
    .returning();
  if (!campaign) {
    res.status(404).json({ error: "Campanha não encontrada." });
    return;
  }
  res.json(campaign);
});

// DELETE /marketing/wa/campaigns/:id
router.delete("/marketing/wa/campaigns/:id", async (req, res): Promise<void> => {
  if (req.session.role !== "admin") {
    res.status(403).json({ error: "Acesso negado." });
    return;
  }
  const id = parseInt(req.params.id, 10);
  await db.delete(whatsappCampaignsTable).where(eq(whatsappCampaignsTable.id, id));
  res.json({ message: "Campanha removida." });
});

// GET /marketing/wa/campaigns/:id/sends
router.get("/marketing/wa/campaigns/:id/sends", async (req, res): Promise<void> => {
  if (req.session.role !== "admin") { res.status(403).json({ error: "Acesso negado." }); return; }
  const id = parseInt(req.params.id, 10);
  const rows = await db.execute<{
    id: number; phone: string; recipient_name: string | null; status: string;
    sent_at: Date | null; error: string | null; created_at: Date; unsubscribed_at: Date | null;
  }>(sql`
    SELECT ws.id, ws.phone, ws.recipient_name, ws.status, ws.sent_at, ws.error, ws.created_at,
           mc.unsubscribed_at
    FROM whatsapp_sends ws
    LEFT JOIN marketing_contacts mc ON mc.phone = ws.phone AND mc.unsubscribed_at IS NOT NULL
    WHERE ws.campaign_id = ${id}
    ORDER BY ws.created_at ASC
  `);
  res.json(rows.rows.map(r => ({
    id: r.id,
    phone: r.phone,
    recipientName: r.recipient_name,
    status: r.status,
    sentAt: r.sent_at,
    error: r.error,
    unsubscribed: !!r.unsubscribed_at,
    createdAt: r.created_at,
  })));
});

// GET /marketing/wa/campaigns/:id/progress
router.get("/marketing/wa/campaigns/:id/progress", async (req, res): Promise<void> => {
  if (req.session.role !== "admin") {
    res.status(403).json({ error: "Acesso negado." });
    return;
  }
  const id = parseInt(req.params.id, 10);
  const [campaign] = await db
    .select()
    .from(whatsappCampaignsTable)
    .where(eq(whatsappCampaignsTable.id, id))
    .limit(1);
  if (!campaign) {
    res.status(404).json({ error: "Campanha não encontrada." });
    return;
  }
  res.json({
    status: campaign.status,
    totalSent: campaign.totalSent,
    totalFailed: campaign.totalFailed,
    totalContacts: campaign.totalContacts,
    paused: pausedWaCampaigns.has(id),
  });
});

// POST /marketing/wa/campaigns/:id/pause
router.post("/marketing/wa/campaigns/:id/pause", async (req, res): Promise<void> => {
  if (req.session.role !== "admin") {
    res.status(403).json({ error: "Acesso negado." });
    return;
  }
  const id = parseInt(req.params.id, 10);
  pausedWaCampaigns.add(id);
  await db
    .update(whatsappCampaignsTable)
    .set({ status: "paused" })
    .where(eq(whatsappCampaignsTable.id, id));
  res.json({ message: "Campanha pausada." });
});

// POST /marketing/wa/campaigns/:id/resume
router.post("/marketing/wa/campaigns/:id/resume", async (req, res): Promise<void> => {
  if (req.session.role !== "admin") {
    res.status(403).json({ error: "Acesso negado." });
    return;
  }
  const id = parseInt(req.params.id, 10);
  pausedWaCampaigns.delete(id);
  await db
    .update(whatsappCampaignsTable)
    .set({ status: "sending" })
    .where(eq(whatsappCampaignsTable.id, id));
  res.json({ message: "Retomando envio…" });
  dispatchWaCampaign(id).catch((err) =>
    logger.error({ campaignId: id, err }, "WA resume dispatch error"),
  );
});

// POST /marketing/wa/campaigns/:id/send
router.post("/marketing/wa/campaigns/:id/send", async (req, res): Promise<void> => {
  if (req.session.role !== "admin") {
    res.status(403).json({ error: "Acesso negado." });
    return;
  }
  const id = parseInt(req.params.id, 10);
  const { targetOverride, sendPerMinute, sendStartHour, sendEndHour, sendDays, scheduledAt, manualPhones } =
    req.body ?? {};

  const [campaign] = await db
    .select()
    .from(whatsappCampaignsTable)
    .where(eq(whatsappCampaignsTable.id, id))
    .limit(1);
  if (!campaign) {
    res.status(404).json({ error: "Campanha não encontrada." });
    return;
  }
  if (campaign.status === "sending") {
    res.status(400).json({ error: "Campanha já em andamento." });
    return;
  }

  const validTargets = [
    "all",
    "cliente",
    "contador",
    "new_contacts",
    "new_cliente",
    "new_contador",
    "opened_all",
    "opened_cliente",
    "opened_contador",
    "clicked_all",
    "clicked_cliente",
    "clicked_contador",
    "not_opened_cliente",
    "not_opened_contador",
  ];

  const opts: WaDispatchOptions = {};
  if (targetOverride === "manual") {
    opts.targetOverride = "manual";
    if (Array.isArray(manualPhones) && manualPhones.length > 0)
      opts.manualPhones = (manualPhones as string[]).map((p) => String(p).replace(/\D/g, "")).filter(Boolean);
  } else if (targetOverride && validTargets.includes(targetOverride as string)) {
    opts.targetOverride = targetOverride as string;
  }
  if (sendPerMinute && Number(sendPerMinute) > 0) opts.sendPerMinute = Number(sendPerMinute);
  if (sendStartHour != null && sendEndHour != null) {
    opts.sendStartHour = Number(sendStartHour);
    opts.sendEndHour = Number(sendEndHour);
  }
  if (sendDays) opts.sendDays = String(sendDays);

  // Scheduling
  if (scheduledAt) {
    await db.update(whatsappCampaignsTable).set({
      status: "scheduled",
      scheduledAt: new Date(scheduledAt as string),
      scheduledTargetOverride: opts.targetOverride ?? null,
      sendPerMinute: opts.sendPerMinute ?? null,
      sendStartHour: opts.sendStartHour ?? null,
      sendEndHour: opts.sendEndHour ?? null,
      sendDays: opts.sendDays ?? null,
    }).where(eq(whatsappCampaignsTable.id, id));
    res.json({ message: `Campanha agendada para ${new Date(scheduledAt as string).toLocaleString("pt-BR")}.` });
    return;
  }

  // Fresh re-send: clear previous sends
  if (campaign.status === "sent") {
    await db.delete(whatsappSendsTable).where(eq(whatsappSendsTable.campaignId, id));
  }

  await db.update(whatsappCampaignsTable).set({
    status: "sending",
    totalSent: 0,
    totalFailed: 0,
    sentAt: null,
    sendPerMinute: opts.sendPerMinute ?? null,
    sendStartHour: opts.sendStartHour ?? null,
    sendEndHour: opts.sendEndHour ?? null,
    sendDays: opts.sendDays ?? null,
  }).where(eq(whatsappCampaignsTable.id, id));

  res.json({ message: "Campanha iniciada. Mensagens em envio em segundo plano." });
  setImmediate(() =>
    dispatchWaCampaign(id, opts).catch((err) =>
      logger.error({ err, campaignId: id }, "WA dispatch error"),
    ),
  );
});

// POST /marketing/wa/webhook/sair — Evolution webhook for SAIR detection
router.post("/marketing/wa/webhook/sair", async (req, res): Promise<void> => {
  try {
    const body = req.body ?? {};
    const events: unknown[] = Array.isArray(body.data) ? body.data : [body.data ?? body];

    for (const raw of events) {
      const event = raw as Record<string, unknown>;
      const key = event?.key as Record<string, unknown> | undefined;
      if (key?.fromMe) continue;

      const remoteJid = String(key?.remoteJid ?? "");
      if (!remoteJid || remoteJid.endsWith("@g.us")) continue;

      const rawPhone = remoteJid.split("@")[0] ?? "";
      if (!rawPhone) continue;

      const msg = event?.message as Record<string, unknown> | undefined;
      const msgText = String(
        msg?.conversation ??
        (msg?.extendedTextMessage as Record<string, unknown> | undefined)?.text ??
        (msg?.buttonsResponseMessage as Record<string, unknown> | undefined)?.selectedDisplayText ??
        "",
      )
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      const UNSUB_KEYWORDS = ["SAIR", "STOP", "CANCELAR", "PARAR", "DESCADASTRAR", "NAO QUERO"];
      const isUnsub = UNSUB_KEYWORDS.some(
        (kw) => msgText === kw || msgText.startsWith(kw + " "),
      );
      if (!isUnsub) continue;

      const phoneCleaned = rawPhone.replace(/\D/g, "");
      const phoneWithout55 = phoneCleaned.startsWith("55") ? phoneCleaned.slice(2) : phoneCleaned;
      const phoneWith55 = phoneCleaned.startsWith("55") ? phoneCleaned : `55${phoneCleaned}`;

      type ContactRow = { id: number; name: string };
      const result = await db.execute<ContactRow>(sql`
        SELECT id, name FROM marketing_contacts
        WHERE REGEXP_REPLACE(phone, '[^0-9]', '', 'g') IN (${phoneCleaned}, ${phoneWithout55}, ${phoneWith55})
          AND status != 'unsubscribed'
        LIMIT 1
      `);
      const contact = result.rows[0];

      if (contact) {
        await db.execute(sql`
          UPDATE marketing_contacts
          SET status = 'unsubscribed', unsubscribed_at = NOW()
          WHERE id = ${contact.id}
        `);
        logger.info(
          { contactId: contact.id, name: contact.name, phone: rawPhone },
          "WA: contato descadastrado via SAIR",
        );
      }
    }
  } catch (err) {
    logger.warn({ err }, "WA SAIR webhook error");
  }
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch engine
// ─────────────────────────────────────────────────────────────────────────────

interface WaDispatchOptions {
  targetOverride?: string;
  sendPerMinute?: number;
  sendStartHour?: number;
  sendEndHour?: number;
  sendDays?: string;
  manualPhones?: string[];
}

interface WaContact {
  id: number;
  name: string;
  phone: string;
  type: string;
}

type WaRawRow = {
  id: number;
  name: string;
  phone: string;
  type: string;
  status: string;
  unsubscribed_at: Date | null;
};

async function dispatchWaCampaign(
  campaignId: number,
  opts: WaDispatchOptions = {},
): Promise<void> {
  const [campaign] = await db
    .select()
    .from(whatsappCampaignsTable)
    .where(eq(whatsappCampaignsTable.id, campaignId))
    .limit(1);
  if (!campaign) return;

  const [settings] = await db
    .select({
      evolutionUrl: settingsTable.evolutionUrl,
      evolutionApiKey: settingsTable.evolutionApiKey,
      evolutionInstance: settingsTable.evolutionInstance,
    })
    .from(settingsTable)
    .limit(1);

  if (
    !settings?.evolutionUrl ||
    !settings?.evolutionApiKey ||
    !settings?.evolutionInstance
  ) {
    logger.error({ campaignId }, "Evolution API não configurada — abortando dispatch WA");
    await db
      .update(whatsappCampaignsTable)
      .set({ status: "draft" })
      .where(eq(whatsappCampaignsTable.id, campaignId));
    return;
  }

  const effectiveTarget =
    opts.targetOverride ??
    campaign.scheduledTargetOverride ??
    campaign.targetType;

  // Manual phones: build synthetic contact list, skip DB lookup
  let contacts: WaContact[];
  if (effectiveTarget === "manual" && opts.manualPhones && opts.manualPhones.length > 0) {
    contacts = opts.manualPhones.map((rawPhone, i) => {
      const digits = rawPhone.replace(/\D/g, "");
      const phone = digits.startsWith("55") ? digits : `55${digits}`;
      return { id: -(i + 1), name: "Destinatário", phone, type: "manual" };
    });
  } else {
    contacts = await loadWaContacts(effectiveTarget);
  }

  const alreadySentRows = await db
    .select({ contactId: whatsappSendsTable.contactId })
    .from(whatsappSendsTable)
    .where(
      and(
        eq(whatsappSendsTable.campaignId, campaignId),
        eq(whatsappSendsTable.status, "sent"),
      ),
    );
  const sentContactIds = new Set(
    alreadySentRows.map((r) => r.contactId).filter((id): id is number => id !== null),
  );
  const alreadySentCount = sentContactIds.size;

  await db.delete(whatsappSendsTable).where(
    and(
      eq(whatsappSendsTable.campaignId, campaignId),
      inArray(whatsappSendsTable.status, ["pending", "failed"]),
    ),
  );

  const remaining = contacts.filter((c) => !sentContactIds.has(c.id));

  await db.update(whatsappCampaignsTable).set({
    status: "sending",
    totalContacts: contacts.length,
    totalSent: alreadySentCount,
  }).where(eq(whatsappCampaignsTable.id, campaignId));

  let sent = alreadySentCount;
  let failed = campaign.totalFailed;

  const perMinute = opts.sendPerMinute ?? campaign.sendPerMinute ?? null;
  const delayMs =
    perMinute && perMinute > 0 ? Math.floor(60_000 / perMinute) : 0;

  logger.info(
    { campaignId, total: contacts.length, remaining: remaining.length, perMinute, delayMs },
    "WA dispatch iniciado",
  );

  async function waitIfPaused(): Promise<boolean> {
    const sh = opts.sendStartHour ?? campaign.sendStartHour ?? null;
    const eh = opts.sendEndHour ?? campaign.sendEndHour ?? null;
    const days = opts.sendDays ?? campaign.sendDays ?? null;

    if (
      sh != null &&
      eh != null &&
      !isWithinBusinessHoursWa(sh, eh, days ?? undefined)
    ) {
      if (!pausedWaCampaigns.has(campaignId)) {
        pausedWaCampaigns.add(campaignId);
        await db
          .update(whatsappCampaignsTable)
          .set({ status: "paused" })
          .where(eq(whatsappCampaignsTable.id, campaignId));
        logger.info(
          { campaignId },
          "WA: fora do horário comercial — campanha pausada automaticamente",
        );
      }
    }

    if (!pausedWaCampaigns.has(campaignId)) return true;

    logger.info({ campaignId }, "WA: campanha pausada — aguardando retomada");
    while (pausedWaCampaigns.has(campaignId)) {
      await new Promise((r) => setTimeout(r, 3_000));
      const [check] = await db
        .select({ status: whatsappCampaignsTable.status })
        .from(whatsappCampaignsTable)
        .where(eq(whatsappCampaignsTable.id, campaignId))
        .limit(1);
      if (!check || check.status === "draft" || check.status === "cancelled") {
        logger.info({ campaignId }, "WA: campanha cancelada durante pausa — abortando");
        return false;
      }
    }
    logger.info({ campaignId }, "WA: campanha retomada — continuando envio");
    return true;
  }

  for (const contact of remaining) {
    if (!(await waitIfPaused())) return;

    const isManualContact = contact.id < 0;

    if (!isManualContact) {
      const [fresh] = await db
        .select({
          status: marketingContactsTable.status,
          unsubscribedAt: marketingContactsTable.unsubscribedAt,
        })
        .from(marketingContactsTable)
        .where(eq(marketingContactsTable.id, contact.id))
        .limit(1);

      if (!fresh || fresh.status !== "active" || fresh.unsubscribedAt) {
        logger.info(
          { contactId: contact.id, phone: contact.phone },
          "WA: contato inativo/descadastrado — pulando",
        );
        continue;
      }
    }

    await db
      .insert(whatsappSendsTable)
      .values({
        campaignId,
        contactId: isManualContact ? null : contact.id,
        phone: contact.phone,
        recipientName: contact.name,
        status: "pending",
      })
      .onConflictDoNothing();

    const personalized =
      campaign.message.replace(/\{\{nome\}\}/gi, contact.name) +
      "\n\n_Responda *SAIR* para cancelar o recebimento._";

    try {
      await sendWhatsApp(
        {
          evolutionUrl: settings.evolutionUrl!,
          evolutionApiKey: settings.evolutionApiKey!,
          evolutionInstance: settings.evolutionInstance!,
        },
        contact.phone,
        personalized,
      );

      await db
        .update(whatsappSendsTable)
        .set({ status: "sent", sentAt: new Date() })
        .where(
          and(
            eq(whatsappSendsTable.campaignId, campaignId),
            eq(whatsappSendsTable.phone, contact.phone),
          ),
        );

      sent++;
      await db
        .update(whatsappCampaignsTable)
        .set({ totalSent: sent })
        .where(eq(whatsappCampaignsTable.id, campaignId));

      logger.info({ campaignId, phone: contact.phone, sent }, "WA: mensagem enviada");
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await db
        .update(whatsappSendsTable)
        .set({ status: "failed", error })
        .where(
          and(
            eq(whatsappSendsTable.campaignId, campaignId),
            eq(whatsappSendsTable.phone, contact.phone),
          ),
        );
      failed++;
      await db
        .update(whatsappCampaignsTable)
        .set({ totalFailed: failed })
        .where(eq(whatsappCampaignsTable.id, campaignId));
      logger.warn({ campaignId, phone: contact.phone, error }, "WA: mensagem falhou");
    }

    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  const [finalState] = await db
    .select({ status: whatsappCampaignsTable.status })
    .from(whatsappCampaignsTable)
    .where(eq(whatsappCampaignsTable.id, campaignId))
    .limit(1);

  if (
    !finalState ||
    finalState.status === "cancelled" ||
    finalState.status === "paused"
  )
    return;

  await db
    .update(whatsappCampaignsTable)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(whatsappCampaignsTable.id, campaignId));

  logger.info({ campaignId, sent, failed }, "WA: dispatch completo");
}

async function loadWaContacts(effectiveTarget: string): Promise<WaContact[]> {
  const baseWhere = sql`status = 'active' AND unsubscribed_at IS NULL AND phone IS NOT NULL AND phone != ''`;

  let rows: WaRawRow[] = [];

  if (effectiveTarget === "all") {
    const r = await db.execute<WaRawRow>(
      sql`SELECT id, name, phone, type, status, unsubscribed_at FROM marketing_contacts WHERE ${baseWhere}`,
    );
    rows = r.rows;
  } else if (effectiveTarget === "cliente") {
    const r = await db.execute<WaRawRow>(
      sql`SELECT id, name, phone, type, status, unsubscribed_at FROM marketing_contacts WHERE ${baseWhere} AND type = 'cliente'`,
    );
    rows = r.rows;
  } else if (effectiveTarget === "contador") {
    const r = await db.execute<WaRawRow>(
      sql`SELECT id, name, phone, type, status, unsubscribed_at FROM marketing_contacts WHERE ${baseWhere} AND type = 'contador'`,
    );
    rows = r.rows;
  } else if (effectiveTarget === "new_contacts") {
    const r = await db.execute<WaRawRow>(
      sql`SELECT id, name, phone, type, status, unsubscribed_at FROM marketing_contacts WHERE ${baseWhere} AND is_new = true`,
    );
    rows = r.rows;
  } else if (effectiveTarget === "new_cliente") {
    const r = await db.execute<WaRawRow>(
      sql`SELECT id, name, phone, type, status, unsubscribed_at FROM marketing_contacts WHERE ${baseWhere} AND is_new = true AND type = 'cliente'`,
    );
    rows = r.rows;
  } else if (effectiveTarget === "new_contador") {
    const r = await db.execute<WaRawRow>(
      sql`SELECT id, name, phone, type, status, unsubscribed_at FROM marketing_contacts WHERE ${baseWhere} AND is_new = true AND type = 'contador'`,
    );
    rows = r.rows;
  } else if (
    effectiveTarget.startsWith("opened_") ||
    effectiveTarget.startsWith("clicked_")
  ) {
    const col = effectiveTarget.startsWith("opened_") ? "opened_at" : "clicked_at";
    const suffix = effectiveTarget.split("_").slice(1).join("_");
    const typeFilter =
      suffix === "cliente"
        ? sql` AND mc.type = 'cliente'`
        : suffix === "contador"
          ? sql` AND mc.type = 'contador'`
          : sql``;
    const r = await db.execute<WaRawRow>(sql`
      SELECT DISTINCT ON (mc.id) mc.id, mc.name, mc.phone, mc.type, mc.status, mc.unsubscribed_at
      FROM marketing_contacts mc
      INNER JOIN marketing_sends ms ON ms.contact_id = mc.id
      WHERE ms.${sql.raw(col)} IS NOT NULL
        AND mc.status = 'active' AND mc.unsubscribed_at IS NULL
        AND mc.phone IS NOT NULL AND mc.phone != ''
        ${typeFilter}
      ORDER BY mc.id
    `);
    rows = r.rows;
  } else if (
    effectiveTarget === "not_opened_cliente" ||
    effectiveTarget === "not_opened_contador"
  ) {
    const contactType =
      effectiveTarget === "not_opened_cliente" ? "cliente" : "contador";
    const r = await db.execute<WaRawRow>(sql`
      SELECT mc.id, mc.name, mc.phone, mc.type, mc.status, mc.unsubscribed_at
      FROM marketing_contacts mc
      WHERE mc.status = 'active' AND mc.unsubscribed_at IS NULL
        AND mc.phone IS NOT NULL AND mc.phone != ''
        AND mc.type = ${contactType}
        AND NOT EXISTS (
          SELECT 1 FROM marketing_sends ms
          WHERE ms.contact_id = mc.id AND ms.opened_at IS NOT NULL
        )
    `);
    rows = r.rows;
  } else {
    const r = await db.execute<WaRawRow>(
      sql`SELECT id, name, phone, type, status, unsubscribed_at FROM marketing_contacts WHERE ${baseWhere}`,
    );
    rows = r.rows;
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    type: r.type,
  }));
}

export { router as whatsappMarketingRouter };
export default router;
