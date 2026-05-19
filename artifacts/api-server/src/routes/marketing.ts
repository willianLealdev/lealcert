import { Router } from "express";
import { eq, desc, ilike, or, sql, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import multer from "multer";
import { parse } from "csv-parse/sync";
import * as xlsx from "xlsx";
import { db, marketingContactsTable, marketingCampaignsTable, marketingSendsTable, marketingRepliesTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { sendMarketingEmail, sendReplyEmail } from "../lib/marketing-email";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function genToken() {
  return randomBytes(24).toString("hex");
}

router.use(requireAdmin);

// ─── Stats ───────────────────────────────────────────────────────────────────
router.get("/marketing/stats", async (req, res): Promise<void> => {
  const [contacts] = await db.select({
    total: sql<number>`count(*)::int`,
    active: sql<number>`count(*) filter (where status = 'active' and not bounced)::int`,
    unsubscribed: sql<number>`count(*) filter (where status = 'unsubscribed')::int`,
    bounced: sql<number>`count(*) filter (where bounced = true)::int`,
  }).from(marketingContactsTable);

  const [campaigns] = await db.select({
    total: sql<number>`count(*)::int`,
    sent: sql<number>`count(*) filter (where status = 'sent')::int`,
    scheduled: sql<number>`count(*) filter (where status = 'scheduled')::int`,
  }).from(marketingCampaignsTable);

  const [replies] = await db.select({
    unread: sql<number>`count(*) filter (where read_at is null)::int`,
  }).from(marketingRepliesTable);

  res.json({
    totalContacts: contacts?.total ?? 0,
    activeContacts: contacts?.active ?? 0,
    unsubscribed: contacts?.unsubscribed ?? 0,
    bounced: contacts?.bounced ?? 0,
    totalCampaigns: campaigns?.total ?? 0,
    sentCampaigns: campaigns?.sent ?? 0,
    scheduledCampaigns: campaigns?.scheduled ?? 0,
    unreadReplies: replies?.unread ?? 0,
  });
});

// ─── Contacts ────────────────────────────────────────────────────────────────
router.get("/marketing/contacts", async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string ?? "1", 10));
  const search = req.query.search as string | undefined;
  const status = req.query.status as string | undefined;
  const type = req.query.type as string | undefined;
  const limit = 50;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) conditions.push(or(ilike(marketingContactsTable.name, `%${search}%`), ilike(marketingContactsTable.email, `%${search}%`)));
  if (status) conditions.push(eq(marketingContactsTable.status, status));
  if (type) conditions.push(eq(marketingContactsTable.type, type));

  const where = conditions.length ? and(...conditions) : undefined;

  const [data, [{ count }]] = await Promise.all([
    db.select().from(marketingContactsTable).where(where).orderBy(desc(marketingContactsTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(marketingContactsTable).where(where),
  ]);

  res.json({ data, total: count });
});

router.post("/marketing/contacts", async (req, res): Promise<void> => {
  const { name, email, phone, tags, type } = req.body ?? {};
  if (!name || !email) { res.status(400).json({ error: "Nome e e-mail são obrigatórios." }); return; }
  const contactType = type === "contador" ? "contador" : "cliente";
  const [contact] = await db.insert(marketingContactsTable).values({ name, email: email.toLowerCase().trim(), phone, tags, type: contactType }).returning();
  res.status(201).json(contact);
});

router.post("/marketing/contacts/import", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "Arquivo não enviado." }); return; }
  const contactType = (req.body?.type === "contador") ? "contador" : "cliente";

  const originalName = req.file.originalname.toLowerCase();
  const isXlsx = originalName.endsWith(".xlsx") || originalName.endsWith(".xls") ||
    req.file.mimetype.includes("spreadsheet") || req.file.mimetype.includes("excel");

  let records: Record<string, string>[];
  try {
    if (isXlsx) {
      const wb = xlsx.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      records = xlsx.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
    } else {
      records = parse(req.file.buffer.toString("utf-8"), { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[];
    }
  } catch {
    res.status(400).json({ error: "Arquivo inválido. Use CSV ou XLSX." }); return;
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of records) {
    // Suporta colunas da planilha de Clientes (NOME/EMAIL) e de Contadores (CONTATO/E-MAIL/TELEFONE)
    const email = String(row["E-MAIL"] ?? row["e-mail"] ?? row.email ?? row.Email ?? row.EMAIL ?? "").toLowerCase().trim();
    const name = String(row.CONTATO ?? row.contato ?? row.NOME ?? row.nome ?? row.name ?? row.Nome ?? row.NAME ?? "").trim();
    const rawPhone = String(row.TELEFONE ?? row.telefone ?? row.phone ?? row.Phone ?? "");
    const phone = rawPhone.replace(/\D/g, "").slice(0, 20) || undefined;
    const tags = row.tags ?? row.Tags ?? undefined;
    if (!email || !name) { skipped++; continue; }
    try {
      await db.insert(marketingContactsTable).values({ name, email, phone, tags, type: contactType }).onConflictDoNothing();
      imported++;
    } catch {
      errors.push(email);
      skipped++;
    }
  }

  res.json({ imported, skipped, total: records.length, errors: errors.slice(0, 20) });
});

router.patch("/marketing/contacts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { status, tags } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (status !== undefined) {
    updates.status = status;
    if (status === "unsubscribed") updates.unsubscribedAt = new Date();
  }
  if (tags !== undefined) updates.tags = tags;
  const [contact] = await db.update(marketingContactsTable).set(updates).where(eq(marketingContactsTable.id, id)).returning();
  res.json(contact);
});

router.delete("/marketing/contacts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(marketingContactsTable).where(eq(marketingContactsTable.id, id));
  res.json({ message: "Contato removido." });
});

// ─── Campaigns ───────────────────────────────────────────────────────────────
router.get("/marketing/campaigns", async (req, res): Promise<void> => {
  const campaigns = await db.select().from(marketingCampaignsTable).orderBy(desc(marketingCampaignsTable.createdAt));
  res.json(campaigns);
});

router.get("/marketing/campaigns/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [campaign] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Campanha não encontrada." }); return; }
  res.json(campaign);
});

router.post("/marketing/campaigns", async (req, res): Promise<void> => {
  const { name, subject, bodyHtml, bodyText, fromName, fromEmail, replyTo, scheduledAt, filterTags, targetType } = req.body ?? {};
  if (!name || !subject || !bodyHtml) { res.status(400).json({ error: "Nome, assunto e corpo são obrigatórios." }); return; }
  const [campaign] = await db.insert(marketingCampaignsTable).values({
    name, subject, bodyHtml, bodyText,
    fromName: fromName ?? "LealCert Marketing",
    fromEmail: fromEmail ?? "mkt@lealcert.com.br",
    replyTo, filterTags,
    targetType: (targetType === "cliente" || targetType === "contador") ? targetType : "all",
    scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    status: scheduledAt ? "scheduled" : "draft",
  }).returning();
  res.status(201).json(campaign);
});

router.put("/marketing/campaigns/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { name, subject, bodyHtml, bodyText, fromName, fromEmail, replyTo, scheduledAt, filterTags, targetType } = req.body ?? {};
  const [campaign] = await db.update(marketingCampaignsTable).set({
    name, subject, bodyHtml, bodyText, fromName, fromEmail, replyTo, filterTags,
    targetType: (targetType === "cliente" || targetType === "contador") ? targetType : "all",
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
  }).where(eq(marketingCampaignsTable.id, id)).returning();
  res.json(campaign);
});

router.delete("/marketing/campaigns/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id));
  res.json({ message: "Campanha removida." });
});

router.post("/marketing/campaigns/:id/send", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { scheduledAt } = req.body ?? {};

  const [campaign] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Campanha não encontrada." }); return; }
  if (campaign.status === "sent" || campaign.status === "sending") {
    res.status(400).json({ error: "Campanha já enviada ou em progresso." }); return;
  }

  if (scheduledAt) {
    await db.update(marketingCampaignsTable).set({ status: "scheduled", scheduledAt: new Date(scheduledAt) }).where(eq(marketingCampaignsTable.id, id));
    res.json({ message: `Campanha agendada para ${new Date(scheduledAt).toLocaleString("pt-BR")}.` });
    return;
  }

  await db.update(marketingCampaignsTable).set({ status: "sending" }).where(eq(marketingCampaignsTable.id, id));
  res.json({ message: "Campanha iniciada. Os e-mails serão enviados em segundo plano." });

  setImmediate(() => dispatchCampaign(campaign.id).catch(err => logger.error({ err }, "Campaign dispatch error")));
});

router.post("/marketing/campaigns/:id/cancel", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.update(marketingCampaignsTable).set({ status: "draft", scheduledAt: null }).where(eq(marketingCampaignsTable.id, id));
  res.json({ message: "Campanha cancelada." });
});

// ─── Campaign Dispatch ────────────────────────────────────────────────────────
export async function dispatchCampaign(campaignId: number) {
  const [campaign] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, campaignId)).limit(1);
  if (!campaign) return;

  const typeConditions = [eq(marketingContactsTable.status, "active"), eq(marketingContactsTable.bounced, false)];
  if (campaign.targetType === "cliente") typeConditions.push(eq(marketingContactsTable.type, "cliente"));
  else if (campaign.targetType === "contador") typeConditions.push(eq(marketingContactsTable.type, "contador"));

  const contacts = await db.select().from(marketingContactsTable).where(and(...typeConditions));

  let sent = 0;
  let bounced = 0;

  for (const contact of contacts) {
    const token = genToken();
    try {
      await db.insert(marketingSendsTable).values({
        campaignId, contactId: contact.id, trackingToken: token, status: "pending",
      }).onConflictDoNothing();
    } catch { continue; }

    try {
      await sendMarketingEmail({ campaign, contact, trackingToken: token });
      await db.update(marketingSendsTable).set({ status: "sent", sentAt: new Date() }).where(eq(marketingSendsTable.trackingToken, token));
      sent++;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await db.update(marketingSendsTable).set({ status: "failed", error }).where(eq(marketingSendsTable.trackingToken, token));
      bounced++;
      logger.warn({ email: contact.email, error }, "Failed to send marketing email");
    }

    await new Promise(r => setTimeout(r, 100));
  }

  await db.update(marketingCampaignsTable).set({
    status: "sent", sentAt: new Date(), totalSent: sent, totalDelivered: sent, totalBounced: bounced,
  }).where(eq(marketingCampaignsTable.id, campaignId));

  logger.info({ campaignId, sent, bounced }, "Campaign dispatch complete");
}

// ─── Tracking pixel ───────────────────────────────────────────────────────────
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

router.get("/marketing/track/:token.png", async (req, res): Promise<void> => {
  const token = req.params.token;
  const [send] = await db.select().from(marketingSendsTable).where(eq(marketingSendsTable.trackingToken, token)).limit(1);
  if (send) {
    await db.update(marketingSendsTable).set({
      openedAt: send.openedAt ?? new Date(),
      openCount: send.openCount + 1,
    }).where(eq(marketingSendsTable.id, send.id));
    if (!send.openedAt) {
      await db.update(marketingCampaignsTable).set({ totalOpened: sql`total_opened + 1` }).where(eq(marketingCampaignsTable.id, send.campaignId));
    }
  }
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.send(PIXEL);
});

// ─── Replies ─────────────────────────────────────────────────────────────────
router.get("/marketing/replies", async (req, res): Promise<void> => {
  const unreadOnly = req.query.unreadOnly === "true";
  const where = unreadOnly ? isNull(marketingRepliesTable.readAt) : undefined;
  const replies = await db.select().from(marketingRepliesTable).where(where).orderBy(desc(marketingRepliesTable.createdAt));
  res.json(replies);
});

router.post("/marketing/replies/:id/read", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.update(marketingRepliesTable).set({ readAt: new Date() }).where(eq(marketingRepliesTable.id, id));
  res.json({ message: "Marcado como lido." });
});

router.post("/marketing/replies/:id/reply", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { body } = req.body ?? {};
  if (!body) { res.status(400).json({ error: "Corpo da resposta é obrigatório." }); return; }

  const [reply] = await db.select().from(marketingRepliesTable).where(eq(marketingRepliesTable.id, id)).limit(1);
  if (!reply) { res.status(404).json({ error: "Mensagem não encontrada." }); return; }

  await sendReplyEmail({ to: reply.fromEmail, toName: reply.fromName ?? undefined, subject: `Re: ${reply.subject ?? ""}`, body });
  await db.update(marketingRepliesTable).set({ repliedAt: new Date(), replyBody: body, readAt: reply.readAt ?? new Date() }).where(eq(marketingRepliesTable.id, id));
  res.json({ message: "Resposta enviada." });
});

// ─── Inbound Webhook ─────────────────────────────────────────────────────────
router.post("/marketing/webhook/inbound", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const fromEmail = body.from ?? body.sender ?? body.From ?? "";
  const fromName = body.fromName ?? body.from_name ?? body.FromName ?? null;
  const subject = body.subject ?? body.Subject ?? null;
  const bodyText = body.text ?? body.plain ?? body["body-plain"] ?? null;
  const bodyHtml = body.html ?? body["body-html"] ?? null;

  if (!fromEmail) { res.json({ message: "ignored" }); return; }

  const [contact] = await db.select().from(marketingContactsTable).where(eq(marketingContactsTable.email, fromEmail.toLowerCase())).limit(1);

  let sendId: number | null = null;
  if (contact) {
    const [latestSend] = await db.select().from(marketingSendsTable)
      .where(and(eq(marketingSendsTable.contactId, contact.id), eq(marketingSendsTable.status, "sent")))
      .orderBy(desc(marketingSendsTable.sentAt)).limit(1);
    sendId = latestSend?.id ?? null;
  }

  await db.insert(marketingRepliesTable).values({
    sendId, contactId: contact?.id ?? null, fromEmail, fromName, subject, bodyText, bodyHtml,
  });

  if (sendId) {
    const [send] = await db.select().from(marketingSendsTable).where(eq(marketingSendsTable.id, sendId)).limit(1);
    if (send) await db.update(marketingCampaignsTable).set({ totalReplied: sql`total_replied + 1` }).where(eq(marketingCampaignsTable.id, send.campaignId));
  }

  res.json({ message: "ok" });
});

export default router;
