import { Router } from "express";
import { eq, desc, ilike, or, sql, and, isNull, ne, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { promises as dns } from "dns";
import multer from "multer";
import { parse } from "csv-parse/sync";
import * as xlsx from "xlsx";
import { db, marketingContactsTable, marketingCampaignsTable, marketingSendsTable, marketingRepliesTable, settingsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { sendMarketingEmail, sendReplyEmail } from "../lib/marketing-email";

// ─── Email Validation Helpers ─────────────────────────────────────────────────

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com","guerrillamail.com","guerrillamail.net","guerrillamail.org","guerrillamail.biz","guerrillamail.de",
  "10minutemail.com","10minutemail.net","10minutemail.org","trashmail.com","trashmail.me","trashmail.net","trashmail.at",
  "throwam.com","throwam.net","fakeinbox.com","maildrop.cc","yopmail.com","yopmail.fr","spam4.me",
  "getnada.com","dispostable.com","mailnull.com","sharklasers.com","guerrillamailblock.com",
  "grr.la","guerrillamail.info","byom.de","spam.la","mintemail.com","tempr.email","discard.email",
  "spamgourmet.com","spamgourmet.net","spamgourmet.org","mailnesia.com","mailnull.com",
  "noblepioneer.com","filzmail.com","trbvm.com","trbvn.com","wegwerfmail.de","wegwerfmail.net",
  "spamfree24.org","spamfree24.de","mailme.lv","throwam.com","owlpic.com","dispostable.com",
  "tempinbox.co.uk","tempemail.com","nwldx.com","qq.com.br","armyspy.com","cuvox.de","dayrep.com",
  "einrot.com","fleckens.hu","gustr.com","jourrapide.com","rhyta.com","superrito.com",
  "teleworm.us","zetgets.com","tempr.email","mt2015.com","mt2016.com","mt2017.com",
  "mt2014.com","hailmail.net","inoutmail.eu","inoutmail.net","courriel.fr.nf",
  "zetgets.com","zippymail.info","t.lol","binkmail.com","bobmurchison.com",
]);

const mxCache = new Map<string, { result: boolean; ts: number }>();
const MX_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

async function hasMxRecord(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached && Date.now() - cached.ts < MX_CACHE_TTL) return cached.result;
  try {
    const records = await dns.resolveMx(domain);
    const result = records.length > 0;
    mxCache.set(domain, { result, ts: Date.now() });
    return result;
  } catch {
    mxCache.set(domain, { result: false, ts: Date.now() });
    return false;
  }
}

async function validateEmail(email: string): Promise<"valid" | "invalid" | "disposable"> {
  if (!EMAIL_REGEX.test(email)) return "invalid";
  const domain = email.split("@")[1].toLowerCase();
  if (DISPOSABLE_DOMAINS.has(domain)) return "disposable";
  const mx = await hasMxRecord(domain);
  return mx ? "valid" : "invalid";
}

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function genToken() {
  return randomBytes(24).toString("hex");
}

// ─── Public routes (no auth required) ────────────────────────────────────────

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

router.get("/marketing/click/:token", async (req, res): Promise<void> => {
  const token = req.params.token;
  const dest = req.query.url as string | undefined;

  const [send] = await db.select().from(marketingSendsTable).where(eq(marketingSendsTable.trackingToken, token)).limit(1);
  if (send) {
    await db.update(marketingSendsTable).set({
      clickedAt: send.clickedAt ?? new Date(),
      clickCount: send.clickCount + 1,
    }).where(eq(marketingSendsTable.id, send.id));
    if (!send.clickedAt) {
      await db.update(marketingCampaignsTable).set({ totalClicked: sql`total_clicked + 1` }).where(eq(marketingCampaignsTable.id, send.campaignId));
    }
  }

  const target = dest && /^https?:\/\//.test(dest) ? dest : "/";
  res.redirect(302, target);
});

router.post("/marketing/webhook/inbound", async (req, res): Promise<void> => {
  // ── Validação do secret (se configurado nas settings) ──────────────────────
  const [s] = await db.select({ webhookSecret: settingsTable.webhookSecret }).from(settingsTable).limit(1);
  const configuredSecret = s?.webhookSecret ?? null;
  if (configuredSecret) {
    const provided =
      (req.query.secret as string | undefined) ??
      req.headers["x-webhook-secret"] as string | undefined;
    if (!provided || provided !== configuredSecret) {
      logger.warn({ ip: req.ip }, "marketing/webhook/inbound: token inválido rejeitado");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

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

// ─── Admin-only routes ────────────────────────────────────────────────────────
router.use("/marketing", requireAdmin);

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
  const emailStatus = req.query.emailStatus as string | undefined;
  const limit = 50;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) conditions.push(or(ilike(marketingContactsTable.name, `%${search}%`), ilike(marketingContactsTable.email, `%${search}%`)));
  if (status) conditions.push(eq(marketingContactsTable.status, status));
  if (type) conditions.push(eq(marketingContactsTable.type, type));
  if (emailStatus) conditions.push(eq(marketingContactsTable.emailStatus, emailStatus));

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
      const text = req.file.buffer.toString("utf-8");
      // Auto-detecta separador: ponto-e-vírgula (Excel BR) ou vírgula
      const firstLine = text.split(/\r?\n/)[0] ?? "";
      const delimiter = firstLine.includes(";") ? ";" : ",";
      records = parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true, delimiter }) as Record<string, string>[];
    }
  } catch {
    res.status(400).json({ error: "Arquivo inválido. Use CSV ou XLSX." }); return;
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of records) {
    // Suporta: planilha exportada do sistema (Nome/Email/Telefone/Tipo),
    // planilha de clientes (NOME/EMAIL), planilha de contadores (CONTATO/E-MAIL/TELEFONE)
    const pick = (...keys: string[]) => {
      for (const k of keys) if (row[k] !== undefined && row[k] !== "") return String(row[k]);
      return "";
    };

    const email = pick("Email","email","E-MAIL","e-mail","EMAIL","E_MAIL","E-Mail").toLowerCase().trim();
    const name  = pick(
      "Nome da Empresa","nome da empresa","NOME DA EMPRESA",
      "Nome da Assessoria","NOME DA ASSESSORIA",
      "Razão Social","RAZÃO SOCIAL","Razao Social","RAZAO SOCIAL",
      "Nome","nome","NOME",
      "CONTATO","contato","Contato",
      "name","Name","NAME",
    );
    const rawPhone = pick("Telefone","telefone","TELEFONE","Fone","fone","FONE","phone","Phone","PHONE","Celular","celular","CELULAR");
    const phone = rawPhone.replace(/\D/g, "").slice(0, 20) || undefined;
    // Estado/Cidade armazenados como tags para consulta futura
    const estado = pick("Estado","estado","ESTADO","UF","uf");
    const cidade = pick("Cidade","cidade","CIDADE","Município","municipio");
    const rawTags = pick("Tags","tags","TAGS");
    const tagsArr = [rawTags, estado, cidade].filter(Boolean);
    const tags = tagsArr.length > 0 ? tagsArr.join(", ") : undefined;

    // Tipo da linha pode vir do CSV (exportado) ou do campo do formulário
    const rowType = pick("Tipo","tipo","type","Type");
    const finalType = (rowType === "contador" || rowType === "cliente") ? rowType : contactType;

    if (!email || !name) { skipped++; continue; }

    try {
      await db.insert(marketingContactsTable)
        .values({ name, email, phone, tags, type: finalType })
        .onConflictDoNothing();
      imported++;
    } catch {
      errors.push(email);
      skipped++;
    }
  }

  res.json({ imported, skipped, total: records.length, errors: errors.slice(0, 20) });
});

router.post("/marketing/contacts/validate", async (req, res): Promise<void> => {
  const batchLimit = Math.min(parseInt(req.body?.limit ?? "500", 10), 2000);
  const typeFilter = req.body?.type;

  const conditions = [eq(marketingContactsTable.emailStatus, "unknown")];
  if (typeFilter && typeFilter !== "all") conditions.push(eq(marketingContactsTable.type, typeFilter));

  const contacts = await db.select({ id: marketingContactsTable.id, email: marketingContactsTable.email })
    .from(marketingContactsTable)
    .where(and(...conditions))
    .limit(batchLimit);

  const stats = { processed: 0, valid: 0, invalid: 0, disposable: 0, badFormat: 0, noMx: 0, alreadyValidated: 0, skipped: 0 };

  for (const contact of contacts) {
    try {
      const domain = contact.email.includes("@") ? contact.email.split("@")[1].toLowerCase() : "";
      let status: "valid" | "invalid" | "disposable";
      let reason: string | null = null;

      if (!EMAIL_REGEX.test(contact.email)) {
        status = "invalid";
        reason = "bad_format";
        stats.badFormat++;
      } else if (DISPOSABLE_DOMAINS.has(domain)) {
        status = "disposable";
        reason = "disposable_domain";
        stats.disposable++;
      } else {
        const mx = await hasMxRecord(domain);
        if (mx) {
          status = "valid";
          stats.valid++;
        } else {
          status = "invalid";
          reason = "no_mx";
          stats.noMx++;
        }
      }

      await db.update(marketingContactsTable)
        .set({ emailStatus: status, emailInvalidReason: reason, emailValidatedAt: new Date() })
        .where(eq(marketingContactsTable.id, contact.id));

      if (status === "invalid" || status === "disposable") stats.invalid++;
      stats.processed++;
    } catch {
      stats.skipped++;
    }
  }

  res.json(stats);
});

router.patch("/marketing/contacts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { name, email, phone, status, tags } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (email !== undefined) updates.email = String(email).toLowerCase().trim();
  if (phone !== undefined) updates.phone = String(phone).replace(/\D/g, "").slice(0, 20) || null;
  if (tags !== undefined) updates.tags = tags || null;
  if (status !== undefined) {
    updates.status = status;
    if (status === "unsubscribed") updates.unsubscribedAt = new Date();
  }
  const [contact] = await db.update(marketingContactsTable).set(updates).where(eq(marketingContactsTable.id, id)).returning();
  res.json(contact);
});

router.post("/marketing/contacts/bulk-delete", async (req, res): Promise<void> => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ message: "ids required" }); return; }
  const numericIds = ids.map(Number).filter(n => Number.isFinite(n) && n > 0);
  if (numericIds.length === 0) { res.status(400).json({ message: "No valid ids" }); return; }
  await db.delete(marketingContactsTable).where(inArray(marketingContactsTable.id, numericIds));
  res.json({ deleted: numericIds.length });
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
  const { scheduledAt, targetOverride, specificContactIds, manualRecipients } = req.body ?? {};

  const [campaign] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Campanha não encontrada." }); return; }
  if (campaign.status === "sending") {
    res.status(400).json({ error: "Campanha em andamento, aguarde concluir." }); return;
  }

  const dispatchOpts: DispatchOptions = {};
  if (targetOverride && ["all", "cliente", "contador", "specific", "manual"].includes(targetOverride)) {
    dispatchOpts.targetOverride = targetOverride;
  }
  if (Array.isArray(specificContactIds) && specificContactIds.length > 0) {
    dispatchOpts.specificContactIds = specificContactIds.map(Number);
  }
  if (Array.isArray(manualRecipients) && manualRecipients.length > 0) {
    dispatchOpts.manualRecipients = manualRecipients;
  }

  if (scheduledAt) {
    await db.update(marketingCampaignsTable).set({
      status: "scheduled",
      scheduledAt: new Date(scheduledAt),
      scheduledTargetOverride: dispatchOpts.targetOverride ?? null,
      scheduledContactIds: dispatchOpts.specificContactIds?.length
        ? JSON.stringify(dispatchOpts.specificContactIds) : null,
      scheduledManualRecipients: dispatchOpts.manualRecipients?.length
        ? JSON.stringify(dispatchOpts.manualRecipients) : null,
    }).where(eq(marketingCampaignsTable.id, id));
    res.json({ message: `Campanha agendada para ${new Date(scheduledAt).toLocaleString("pt-BR")}.` });
    return;
  }

  if (campaign.status === "sent") {
    await db.delete(marketingSendsTable).where(eq(marketingSendsTable.campaignId, id));
  }

  await db.update(marketingCampaignsTable).set({
    status: "sending",
    totalSent: 0, totalDelivered: 0, totalOpened: 0, totalClicked: 0, totalBounced: 0, totalReplied: 0,
    sentAt: null,
  }).where(eq(marketingCampaignsTable.id, id));
  res.json({ message: "Campanha iniciada. Os e-mails serão enviados em segundo plano." });

  setImmediate(() => dispatchCampaign(campaign.id, dispatchOpts).catch(err => logger.error({ err }, "Campaign dispatch error")));
});

router.post("/marketing/campaigns/:id/duplicate", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [campaign] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Campanha não encontrada." }); return; }
  const [copy] = await db.insert(marketingCampaignsTable).values({
    name: campaign.name + " (cópia)",
    subject: campaign.subject,
    bodyHtml: campaign.bodyHtml,
    bodyText: campaign.bodyText ?? undefined,
    fromName: campaign.fromName,
    fromEmail: campaign.fromEmail,
    replyTo: campaign.replyTo ?? undefined,
    filterTags: campaign.filterTags ?? undefined,
    targetType: campaign.targetType,
    status: "draft",
  }).returning();
  res.status(201).json(copy);
});

router.post("/marketing/campaigns/:id/cancel", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.update(marketingCampaignsTable).set({ status: "draft", scheduledAt: null }).where(eq(marketingCampaignsTable.id, id));
  res.json({ message: "Campanha cancelada." });
});

// ─── Campaign Dispatch ────────────────────────────────────────────────────────
export interface DispatchOptions {
  targetOverride?: "all" | "cliente" | "contador" | "specific" | "manual";
  specificContactIds?: number[];
  manualRecipients?: { name: string; email: string }[];
}

export async function dispatchCampaign(campaignId: number, opts: DispatchOptions = {}) {
  const [campaign] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, campaignId)).limit(1);
  if (!campaign) return;

  const effectiveTarget = opts.targetOverride ?? campaign.targetType;

  let contacts: { id: number; name: string; email: string; phone: string | null; type: string; status: string; bounced: boolean; tags: string | null; emailStatus: string; emailInvalidReason: string | null; emailValidatedAt: Date | null; unsubscribedAt: Date | null; createdAt: Date }[] = [];

  if (effectiveTarget === "manual" && opts.manualRecipients?.length) {
    contacts = opts.manualRecipients.map((r, i) => ({
      id: -(i + 1), name: r.name, email: r.email, phone: null,
      type: "manual", status: "active", bounced: false, tags: null,
      emailStatus: "unknown", emailInvalidReason: null, emailValidatedAt: null,
      unsubscribedAt: null, createdAt: new Date(),
    }));
  } else if (effectiveTarget === "specific" && opts.specificContactIds?.length) {
    contacts = await db.select().from(marketingContactsTable)
      .where(inArray(marketingContactsTable.id, opts.specificContactIds));
  } else {
    const typeFilter = effectiveTarget === "cliente" ? "cliente" : effectiveTarget === "contador" ? "contador" : null;
    const rawContacts = await db.execute<{ id: number; name: string; email: string; phone: string | null; type: string; status: string; bounced: boolean; tags: string | null; email_status: string; email_invalid_reason: string | null; email_validated_at: Date | null; unsubscribed_at: Date | null; created_at: Date }>(
      sql`SELECT * FROM marketing_contacts WHERE status = 'active' AND bounced = false AND email_status NOT IN ('invalid', 'disposable')${typeFilter ? sql` AND type = ${typeFilter}` : sql``}`
    );
    contacts = rawContacts.rows.map(r => ({
      id: r.id, name: r.name, email: r.email, phone: r.phone, type: r.type, status: r.status,
      bounced: r.bounced, tags: r.tags, emailStatus: r.email_status,
      emailInvalidReason: r.email_invalid_reason, emailValidatedAt: r.email_validated_at,
      unsubscribedAt: r.unsubscribed_at, createdAt: r.created_at,
    }));
    logger.info({ campaignId, effectiveTarget, contactsFound: contacts.length }, "Dispatch contacts loaded");
  }

  let sent = 0;
  let bounced = 0;

  for (const contact of contacts) {
    const token = genToken();
    try {
      await db.insert(marketingSendsTable).values({
        campaignId, contactId: contact.id > 0 ? contact.id : null, trackingToken: token, status: "pending",
      });
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

      // Marcar contato como bloqueado por bounce se for um contato real da base
      if (contact.id > 0) {
        const isPermanentBounce = /550|551|552|553|554|user.unknown|does not exist|invalid|no such user|mailbox.*not.*found|bounce/i.test(error);
        if (isPermanentBounce) {
          await db.update(marketingContactsTable)
            .set({ bounced: true })
            .where(eq(marketingContactsTable.id, contact.id));
          logger.info({ contactId: contact.id, email: contact.email }, "Contato marcado como bloqueado por bounce permanente");
        }
      }
    }

    await new Promise(r => setTimeout(r, 100));
  }

  await db.update(marketingCampaignsTable).set({
    status: "sent", sentAt: new Date(), totalSent: sent, totalDelivered: sent, totalBounced: bounced,
  }).where(eq(marketingCampaignsTable.id, campaignId));

  logger.info({ campaignId, sent, bounced }, "Campaign dispatch complete");
}

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

export default router;
