import { Router } from "express";
import { eq, desc, ilike, or, sql, and, isNull, ne, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { promises as dns } from "dns";
import * as net from "net";
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

// ── MX cache ──────────────────────────────────────────────────────────────────
const mxCache = new Map<string, { hosts: string[]; ts: number }>();
const MX_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

async function getMxHosts(domain: string): Promise<string[]> {
  const cached = mxCache.get(domain);
  if (cached && Date.now() - cached.ts < MX_CACHE_TTL) return cached.hosts;
  try {
    const records = await dns.resolveMx(domain);
    const hosts = records.sort((a, b) => a.priority - b.priority).map(r => r.exchange);
    mxCache.set(domain, { hosts, ts: Date.now() });
    return hosts;
  } catch {
    mxCache.set(domain, { hosts: [], ts: Date.now() });
    return [];
  }
}

// ── SMTP mailbox verification ─────────────────────────────────────────────────
// Connects directly to the MX server and checks if the mailbox exists
// using RCPT TO — same technique used by ZeroBounce, NeverBounce, etc.
//
// Limitation: Gmail, Outlook, Yahoo are "catch-all" — they accept any RCPT TO
// to prevent email enumeration, so they'll always return "valid" here.
// For corporate/business domains this works very well.

const smtpCache = new Map<string, { result: "valid" | "invalid" | "unknown"; ts: number }>();
const SMTP_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias

// Free email providers are catch-all — skip SMTP check, they're always "valid"
const CATCHALL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.com.br",
  "live.com", "msn.com", "yahoo.com", "yahoo.com.br", "icloud.com", "me.com",
  "uol.com.br", "bol.com.br", "terra.com.br", "ig.com.br", "globo.com",
  "protonmail.com", "pm.me",
]);

async function smtpVerifyMailbox(email: string, mxHost: string): Promise<"valid" | "invalid" | "unknown"> {
  return new Promise((resolve) => {
    let buf = "";
    let step = 0;
    let done = false;

    const finish = (result: "valid" | "invalid" | "unknown") => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch { /* ignore */ }
      resolve(result);
    };

    const socket = net.createConnection({ host: mxHost, port: 25 });
    socket.setTimeout(9000);
    socket.setEncoding("utf8");

    socket.on("timeout", () => finish("unknown"));
    socket.on("error", () => finish("unknown"));
    socket.on("close", () => finish("unknown"));

    socket.on("data", (chunk: string) => {
      buf += chunk;
      // Process all complete lines
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const code = parseInt(line.slice(0, 3), 10);
        const isFinal = line[3] !== "-"; // multi-line response continues with "-"
        if (!isFinal) continue; // wait for final line of multi-line response

        if (step === 0) {
          // Waiting for banner (220)
          if (code === 220) {
            socket.write("EHLO mail-verify.local\r\n");
            step = 1;
          } else {
            finish("unknown");
          }
        } else if (step === 1) {
          // Waiting for EHLO response (250)
          if (code === 250) {
            socket.write("MAIL FROM:<verify@mail-verify.local>\r\n");
            step = 2;
          } else {
            finish("unknown");
          }
        } else if (step === 2) {
          // Waiting for MAIL FROM response (250)
          if (code === 250) {
            socket.write(`RCPT TO:<${email}>\r\n`);
            step = 3;
          } else {
            finish("unknown");
          }
        } else if (step === 3) {
          // This is the key check — response to RCPT TO
          if (code === 250 || code === 251) {
            finish("valid");
          } else if (code >= 550 && code <= 554) {
            // 550 user unknown, 551 user not local, 552 mailbox full, 553 bad address, 554 rejected
            finish("invalid");
          } else {
            // 4xx = temporary error, 421 = service unavailable → inconclusive
            finish("unknown");
          }
          socket.write("QUIT\r\n");
        }
      }
    });
  });
}

async function validateEmailSmtp(email: string): Promise<"valid" | "invalid" | "unknown"> {
  const cached = smtpCache.get(email);
  if (cached && Date.now() - cached.ts < SMTP_CACHE_TTL) return cached.result;

  const domain = email.split("@")[1].toLowerCase();
  const mxHosts = await getMxHosts(domain);
  if (!mxHosts.length) {
    smtpCache.set(email, { result: "invalid", ts: Date.now() });
    return "invalid";
  }

  // Try first two MX hosts
  for (const host of mxHosts.slice(0, 2)) {
    const result = await smtpVerifyMailbox(email, host);
    if (result !== "unknown") {
      smtpCache.set(email, { result, ts: Date.now() });
      return result;
    }
  }

  // Inconclusive — MX exists but SMTP check wasn't conclusive
  smtpCache.set(email, { result: "unknown", ts: Date.now() });
  return "unknown";
}

async function getZeroBounceApiKey(): Promise<string | null> {
  try {
    const rows = await db.select({ zeroBounceApiKey: settingsTable.zeroBounceApiKey }).from(settingsTable).limit(1);
    return rows[0]?.zeroBounceApiKey ?? null;
  } catch { return null; }
}

const zbCache = new Map<string, { status: "valid" | "invalid" | "disposable"; ts: number }>();
const ZB_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias

async function validateEmailZeroBounce(email: string, apiKey: string): Promise<"valid" | "invalid" | "disposable"> {
  const cached = zbCache.get(email);
  if (cached && Date.now() - cached.ts < ZB_CACHE_TTL) return cached.status;
  try {
    const url = `https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}&ip_address=`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`ZeroBounce HTTP ${res.status}`);
    const data = await res.json() as { status: string; sub_status: string };
    let status: "valid" | "invalid" | "disposable";
    if (data.status === "valid") status = "valid";
    else if (data.sub_status === "disposable") status = "disposable";
    else status = "invalid";
    zbCache.set(email, { status, ts: Date.now() });
    return status;
  } catch {
    // ZeroBounce failed — fall back to SMTP
    const smtpResult = await validateEmailSmtp(email);
    return smtpResult === "invalid" ? "invalid" : "valid";
  }
}

async function validateEmail(email: string): Promise<"valid" | "invalid" | "disposable"> {
  if (!EMAIL_REGEX.test(email)) return "invalid";
  const domain = email.split("@")[1].toLowerCase();
  if (DISPOSABLE_DOMAINS.has(domain)) return "disposable";

  // ZeroBounce API — se configurada, usa ela (mais precisa para catch-all domains)
  const zbKey = await getZeroBounceApiKey();
  if (zbKey) return validateEmailZeroBounce(email, zbKey);

  // Verificação SMTP nativa — igual ao ZeroBounce por baixo
  if (!CATCHALL_DOMAINS.has(domain)) {
    const smtpResult = await validateEmailSmtp(email);
    if (smtpResult === "invalid") return "invalid";
    if (smtpResult === "valid") return "valid";
    // "unknown" → server bloqueou ou timeout → assume válido se MX existe
  }

  // Para domínios catch-all (Gmail, Outlook) e fallback de SMTP inconclusivo:
  // só verifica se o domínio tem MX (não tem como saber se a caixa existe)
  const hosts = await getMxHosts(domain);
  return hosts.length > 0 ? "valid" : "invalid";
}

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function genToken() {
  return randomBytes(24).toString("hex");
}

// ─── Public routes (no auth required) ────────────────────────────────────────

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// ─── Unsubscribe (público — sem auth) ─────────────────────────────────────────
router.get("/marketing/unsubscribe", async (req, res): Promise<void> => {
  const token = req.query.token as string | undefined;
  if (!token) { res.status(400).json({ error: "Token ausente." }); return; }

  const [send] = await db.select().from(marketingSendsTable).where(eq(marketingSendsTable.trackingToken, token)).limit(1);
  if (!send) { res.status(404).json({ error: "Link inválido ou expirado." }); return; }

  let already = false;
  if (send.contactId) {
    const result = await db.execute<{ updated: number }>(sql`
      WITH updated AS (
        UPDATE marketing_contacts
        SET status = 'unsubscribed', unsubscribed_at = NOW()
        WHERE id = ${send.contactId}
          AND status != 'unsubscribed'
        RETURNING 1
      )
      SELECT count(*)::int AS updated FROM updated
    `);
    already = (result.rows[0]?.updated ?? 0) === 0;
  }

  res.json({ message: "Descadastro realizado com sucesso.", already });
});

router.get("/marketing/track/:token", async (req, res): Promise<void> => {
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
    permanentBounced: sql<number>`count(*) filter (where bounced = true)::int`,
  }).from(marketingContactsTable);

  // Contatos distintos com pelo menos um envio falhado (bounce real)
  const bouncedResult = await db.execute<{ bouncedContacts: number }>(sql`
    SELECT count(DISTINCT ms.contact_id)::int AS "bouncedContacts"
    FROM marketing_sends ms
    WHERE ms.status = 'failed' AND ms.contact_id IS NOT NULL
  `);
  const bouncedContacts = bouncedResult.rows[0]?.bouncedContacts ?? 0;

  const [campaigns] = await db.select({
    total: sql<number>`count(*)::int`,
    sent: sql<number>`count(*) filter (where status = 'sent')::int`,
    scheduled: sql<number>`count(*) filter (where status = 'scheduled')::int`,
    totalBounced: sql<number>`coalesce(sum(total_bounced), 0)::int`,
  }).from(marketingCampaignsTable);

  const [replies] = await db.select({
    unread: sql<number>`count(*) filter (where read_at is null)::int`,
  }).from(marketingRepliesTable);

  res.json({
    totalContacts: contacts?.total ?? 0,
    activeContacts: contacts?.active ?? 0,
    unsubscribed: contacts?.unsubscribed ?? 0,
    bounced: bouncedContacts ?? 0,                      // contatos distintos com envio falhado
    permanentBounced: contacts?.permanentBounced ?? 0,  // contatos bloqueados permanentemente (flag)
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

  const isNewFilter = req.query.isNew as string | undefined;

  const conditions = [];
  if (search) conditions.push(or(ilike(marketingContactsTable.name, `%${search}%`), ilike(marketingContactsTable.email, `%${search}%`)));
  if (status) conditions.push(eq(marketingContactsTable.status, status));
  if (type) conditions.push(eq(marketingContactsTable.type, type));
  if (emailStatus) conditions.push(eq(marketingContactsTable.emailStatus, emailStatus));
  if (isNewFilter === "true") conditions.push(eq(marketingContactsTable.isNew, true));
  else if (isNewFilter === "false") conditions.push(eq(marketingContactsTable.isNew, false));

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

  type ContactRow = { name: string; email: string; phone?: string; tags?: string; type: string };
  const validRows: ContactRow[] = [];
  let parseSkipped = 0;

  for (const row of records) {
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
    const estado = pick("Estado","estado","ESTADO","UF","uf");
    const cidade = pick("Cidade","cidade","CIDADE","Município","municipio");
    const rawTags = pick("Tags","tags","TAGS");
    const tagsArr = [rawTags, estado, cidade].filter(Boolean);
    const tags = tagsArr.length > 0 ? tagsArr.join(", ") : undefined;
    const rowType = pick("Tipo","tipo","type","Type");
    const finalType = (rowType === "contador" || rowType === "cliente") ? rowType : contactType;

    if (!email || !name) { parseSkipped++; continue; }
    validRows.push({ name, email, phone, tags, type: finalType });
  }

  // Responde imediatamente para não sofrer timeout do proxy (VPS)
  res.json({ started: true, total: records.length, valid: validRows.length, skipped: parseSkipped });

  // Processa inserções em background (lotes de 500)
  const BATCH = 500;
  (async () => {
    for (let i = 0; i < validRows.length; i += BATCH) {
      const batch = validRows.slice(i, i + BATCH);
      try {
        await db.insert(marketingContactsTable).values(batch).onConflictDoNothing();
      } catch {
        for (const row of batch) {
          try { await db.insert(marketingContactsTable).values(row).onConflictDoNothing(); } catch { /* ignora duplicatas */ }
        }
      }
    }
    logger.info({ total: validRows.length }, "Import background: concluído");
  })().catch(err => logger.error({ err }, "Import background: erro"));
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

  const zbKey = await getZeroBounceApiKey();
  const stats = { processed: 0, valid: 0, invalid: 0, disposable: 0, badFormat: 0, noMx: 0, alreadyValidated: 0, skipped: 0, zeroBounce: !!zbKey };

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
      } else if (zbKey) {
        status = await validateEmailZeroBounce(contact.email, zbKey);
        if (status === "valid") stats.valid++;
        else if (status === "disposable") { stats.disposable++; reason = "disposable_domain"; }
        else { stats.noMx++; reason = "zerobounce_invalid"; }
      } else {
        const hosts = await getMxHosts(domain);
        if (hosts.length > 0) {
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

// ─── Bounces ──────────────────────────────────────────────────────────────────
router.get("/marketing/bounces", async (_req, res): Promise<void> => {
  // Busca contatos que tiveram pelo menos um envio falhado em marketing_sends
  // (independente de ter bounced=true — contatos com bounced=true sem envio registrado também entram)
  const rows = await db.execute<{
    id: number; name: string; email: string; type: string; tags: string | null; created_at: Date;
    last_error: string | null; last_sent_at: Date | null; campaign_name: string | null; campaign_id: number | null;
    bounced: boolean;
  }>(sql`
    SELECT
      c.id, c.name, c.email, c.type, c.tags, c.created_at, c.bounced,
      s.error     AS last_error,
      s.sent_at   AS last_sent_at,
      camp.name   AS campaign_name,
      camp.id     AS campaign_id
    FROM marketing_contacts c
    INNER JOIN LATERAL (
      SELECT ms.error, ms.sent_at, ms.campaign_id
      FROM marketing_sends ms
      WHERE ms.contact_id = c.id AND ms.status = 'failed'
      ORDER BY ms.created_at DESC
      LIMIT 1
    ) s ON true
    LEFT JOIN marketing_campaigns camp ON camp.id = s.campaign_id
    UNION
    SELECT
      c.id, c.name, c.email, c.type, c.tags, c.created_at, c.bounced,
      NULL AS last_error, NULL AS last_sent_at, NULL AS campaign_name, NULL AS campaign_id
    FROM marketing_contacts c
    WHERE c.bounced = true
      AND NOT EXISTS (
        SELECT 1 FROM marketing_sends ms WHERE ms.contact_id = c.id AND ms.status = 'failed'
      )
    ORDER BY last_sent_at DESC NULLS LAST, created_at DESC
  `);

  res.json(rows.rows.map(r => ({
    id: r.id,
    name: r.name,
    email: r.email,
    type: r.type,
    tags: r.tags,
    createdAt: r.created_at,
    lastError: r.last_error,
    lastSentAt: r.last_sent_at,
    campaignName: r.campaign_name,
    campaignId: r.campaign_id,
  })));
});

router.patch("/marketing/bounces/:id/restore", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  // Só atualiza bounced=false — não toca em colunas opcionais que podem não existir na DB
  const result = await db.execute<{ id: number }>(sql`
    UPDATE marketing_contacts SET bounced = false WHERE id = ${id} RETURNING id
  `);
  if (!result.rows.length) { res.status(404).json({ error: "Contato não encontrado." }); return; }
  // Remove os sends falhados para que o contato saia da lista de bounces
  await db.execute(sql`UPDATE marketing_sends SET status = 'ignored' WHERE contact_id = ${id} AND status = 'failed'`);
  res.json({ message: "Contato restaurado." });
});

router.delete("/marketing/bounces/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(marketingContactsTable).where(eq(marketingContactsTable.id, id));
  res.json({ message: "Contato removido." });
});

router.patch("/marketing/bounces/restore-all", async (_req, res): Promise<void> => {
  // Restaura todos os contatos que aparecem na lista de bounces:
  // tanto os com bounced=true quanto os que têm envios falhados
  // Restaura contatos com bounced=true OU com sends falhados — só altera bounced=false
  // (não toca em colunas opcionais que podem não existir na DB da VPS)
  const result = await db.execute<{ id: number }>(sql`
    UPDATE marketing_contacts
    SET bounced = false
    WHERE bounced = true
       OR id IN (
         SELECT DISTINCT contact_id FROM marketing_sends
         WHERE status = 'failed' AND contact_id IS NOT NULL
       )
    RETURNING id
  `);
  const count = result.rows.length;
  // Limpa todos os sends falhados para tirá-los da lista de bounces
  await db.execute(sql`UPDATE marketing_sends SET status = 'ignored' WHERE status = 'failed'`);
  res.json({ message: `${count} contato(s) restaurado(s).`, count });
});

router.delete("/marketing/bounces", async (_req, res): Promise<void> => {
  // Deleta contatos que aparecem na lista de bounces (bounced=true OU têm envio falhado)
  const result = await db.execute<{ id: number }>(sql`
    DELETE FROM marketing_contacts
    WHERE bounced = true
       OR id IN (
         SELECT DISTINCT contact_id FROM marketing_sends
         WHERE status = 'failed' AND contact_id IS NOT NULL
       )
    RETURNING id
  `);
  res.json({ message: `${result.rows.length} contato(s) excluído(s).`, count: result.rows.length });
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
    targetType: (["cliente","contador","new_contacts","not_opened_cliente","not_opened_contador","opened_all","opened_cliente","opened_contador","clicked_all","clicked_cliente","clicked_contador"].includes(targetType)) ? targetType : "all",
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
    targetType: (["cliente","contador","new_contacts","not_opened_cliente","not_opened_contador","opened_all","opened_cliente","opened_contador","clicked_all","clicked_cliente","clicked_contador"].includes(targetType)) ? targetType : "all",
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
  const validTargets = [
    "all", "cliente", "contador", "specific", "manual",
    "opened_all", "opened_cliente", "opened_contador",
    "clicked_all", "clicked_cliente", "clicked_contador",
    "not_opened_cliente", "not_opened_contador",
  ];
  if (targetOverride && validTargets.includes(targetOverride)) {
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

router.get("/marketing/campaigns/:id/sends", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const statusFilter = req.query.status as string | undefined;

  const rows = await db.execute<{
    id: number; contact_id: number | null; email: string; name: string | null;
    status: string; sent_at: Date | null; error: string | null;
    opened_at: Date | null; open_count: number; clicked_at: Date | null; click_count: number;
  }>(sql`
    SELECT
      ms.id,
      ms.contact_id,
      coalesce(mc.email, ms.recipient_email)  AS email,
      coalesce(mc.name,  ms.recipient_name)   AS name,
      ms.status,
      ms.sent_at,
      ms.error,
      ms.opened_at,
      ms.open_count,
      ms.clicked_at,
      ms.click_count
    FROM marketing_sends ms
    LEFT JOIN marketing_contacts mc ON mc.id = ms.contact_id
    WHERE ms.campaign_id = ${id}
      ${statusFilter === "sent"    ? sql`AND ms.status = 'sent'`    : sql``}
      ${statusFilter === "failed"  ? sql`AND ms.status = 'failed'`  : sql``}
      ${statusFilter === "pending" ? sql`AND ms.status = 'pending'` : sql``}
      ${statusFilter === "opened"  ? sql`AND ms.opened_at IS NOT NULL` : sql``}
      ${statusFilter === "clicked" ? sql`AND ms.clicked_at IS NOT NULL` : sql``}
    ORDER BY
      CASE ms.status WHEN 'failed' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
      ms.sent_at DESC NULLS LAST
  `);

  res.json(rows.rows.map(r => ({
    id: r.id,
    contactId: r.contact_id,
    email: r.email,
    name: r.name,
    status: r.status,
    sentAt: r.sent_at,
    error: r.error,
    opened: r.opened_at !== null,
    openCount: r.open_count,
    clicked: r.clicked_at !== null,
    clickCount: r.click_count,
    openedAt: r.opened_at,
    clickedAt: r.clicked_at,
  })));
});

router.get("/marketing/campaigns/:id/bounces", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const rows = await db.execute<{
    id: number; contact_id: number | null; email: string; name: string | null; error: string | null; sent_at: Date | null;
  }>(sql`
    SELECT
      ms.id,
      ms.contact_id,
      coalesce(mc.email, ms.recipient_email) AS email,
      coalesce(mc.name, ms.recipient_name)   AS name,
      ms.error,
      ms.sent_at
    FROM marketing_sends ms
    LEFT JOIN marketing_contacts mc ON mc.id = ms.contact_id
    WHERE ms.campaign_id = ${id} AND ms.status = 'failed'
    ORDER BY ms.created_at DESC
  `);
  res.json(rows.rows.map(r => ({
    id: r.id,
    contactId: r.contact_id,
    email: r.email,
    name: r.name,
    error: r.error,
    sentAt: r.sent_at,
  })));
});

router.get("/marketing/campaigns/:id/progress", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [campaign] = await db
    .select({
      status: marketingCampaignsTable.status,
      totalSent: marketingCampaignsTable.totalSent,
      totalContacts: marketingCampaignsTable.totalContacts,
      totalBounced: marketingCampaignsTable.totalBounced,
    })
    .from(marketingCampaignsTable)
    .where(eq(marketingCampaignsTable.id, id))
    .limit(1);
  if (!campaign) { res.status(404).json({ error: "Campanha não encontrada." }); return; }
  res.json(campaign);
});

router.post("/marketing/campaigns/:id/resume", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [campaign] = await db.select({ status: marketingCampaignsTable.status })
    .from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Campanha não encontrada." }); return; }
  if (campaign.status !== "sending") { res.status(400).json({ error: "Campanha não está em andamento." }); return; }
  res.json({ message: "Retomando envio…" });
  dispatchCampaign(id).catch(err => logger.error({ campaignId: id, err }, "Resume dispatch error"));
});

// ─── Campaign Dispatch ────────────────────────────────────────────────────────
export interface DispatchOptions {
  targetOverride?: "all" | "cliente" | "contador" | "specific" | "manual"
    | "opened_all" | "opened_cliente" | "opened_contador"
    | "clicked_all" | "clicked_cliente" | "clicked_contador"
    | "not_opened_cliente" | "not_opened_contador";
  specificContactIds?: number[];
  manualRecipients?: { name: string; email: string }[];
}

type ContactRow = { id: number; name: string; email: string; phone: string | null; type: string; status: string; bounced: boolean; isNew: boolean; tags: string | null; emailStatus: string; emailInvalidReason: string | null; emailValidatedAt: Date | null; unsubscribedAt: Date | null; createdAt: Date };
type RawContactRow = { id: number; name: string; email: string; phone: string | null; type: string; status: string; bounced: boolean; is_new: boolean; tags: string | null; email_status: string; email_invalid_reason: string | null; email_validated_at: Date | null; unsubscribed_at: Date | null; created_at: Date };

// Domínios de email gratuito que devem ser enviados por último e em lotes menores
const FREE_EMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.com.br", "live.com", "msn.com"]);
function isFreeEmail(email: string) { return FREE_EMAIL_DOMAINS.has(email.split("@")[1]?.toLowerCase() ?? ""); }

function mapContact(r: RawContactRow): ContactRow {
  return {
    id: r.id, name: r.name, email: r.email, phone: r.phone, type: r.type, status: r.status,
    bounced: r.bounced, isNew: r.is_new ?? false, tags: r.tags, emailStatus: r.email_status,
    emailInvalidReason: r.email_invalid_reason, emailValidatedAt: r.email_validated_at,
    unsubscribedAt: r.unsubscribed_at, createdAt: r.created_at,
  };
}

export async function dispatchCampaign(campaignId: number, opts: DispatchOptions = {}) {
  const [campaign] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, campaignId)).limit(1);
  if (!campaign) return;

  const effectiveTarget = opts.targetOverride ?? campaign.targetType;

  let contacts: ContactRow[] = [];

  if (effectiveTarget === "manual") {
    if (!opts.manualRecipients?.length) {
      logger.error({ campaignId, effectiveTarget }, "Dispatch abortado: target=manual mas manualRecipients vazio — evitando envio para todos");
      await db.update(marketingCampaignsTable).set({ status: "draft" }).where(eq(marketingCampaignsTable.id, campaignId));
      return;
    }
    contacts = opts.manualRecipients.map((r, i) => ({
      id: -(i + 1), name: r.name, email: r.email, phone: null,
      type: "manual", status: "active", bounced: false, isNew: false, tags: null,
      emailStatus: "unknown", emailInvalidReason: null, emailValidatedAt: null,
      unsubscribedAt: null, createdAt: new Date(),
    }));
  } else if (effectiveTarget === "specific") {
    if (!opts.specificContactIds?.length) {
      logger.error({ campaignId, effectiveTarget }, "Dispatch abortado: target=specific mas specificContactIds vazio — evitando envio para todos");
      await db.update(marketingCampaignsTable).set({ status: "draft" }).where(eq(marketingCampaignsTable.id, campaignId));
      return;
    }
    contacts = await db.select().from(marketingContactsTable)
      .where(inArray(marketingContactsTable.id, opts.specificContactIds));
  } else if (effectiveTarget === "not_opened_cliente" || effectiveTarget === "not_opened_contador") {
    const contactType = effectiveTarget === "not_opened_cliente" ? "cliente" : "contador";
    const rawContacts = await db.execute<RawContactRow>(sql`
      SELECT mc.id, mc.name, mc.email, mc.phone, mc.type, mc.status, mc.bounced, mc.tags,
        mc.email_status, mc.email_invalid_reason, mc.email_validated_at,
        mc.unsubscribed_at, mc.created_at
      FROM marketing_contacts mc
      WHERE mc.status = 'active'
        AND mc.bounced = false
        AND mc.email_status NOT IN ('invalid', 'disposable')
        AND mc.type = ${contactType}
        AND NOT EXISTS (
          SELECT 1 FROM marketing_sends ms
          WHERE ms.contact_id = mc.id AND ms.opened_at IS NOT NULL
        )
    `);
    contacts = rawContacts.rows.map(mapContact);
    logger.info({ campaignId, effectiveTarget, contactsFound: contacts.length }, "Dispatch contacts loaded (not-opened)");
  } else if (effectiveTarget.startsWith("opened_") || effectiveTarget.startsWith("clicked_")) {
    const engagementCol = effectiveTarget.startsWith("opened_") ? "opened_at" : "clicked_at";
    const typeSuffix = effectiveTarget.split("_")[1]; // all | cliente | contador
    const typeClause = typeSuffix === "cliente" ? sql` AND mc.type = 'cliente'`
      : typeSuffix === "contador" ? sql` AND mc.type = 'contador'`
      : sql``;
    const rawContacts = await db.execute<RawContactRow>(sql`
      SELECT DISTINCT ON (mc.id)
        mc.id, mc.name, mc.email, mc.phone, mc.type, mc.status, mc.bounced, mc.tags,
        mc.email_status, mc.email_invalid_reason, mc.email_validated_at,
        mc.unsubscribed_at, mc.created_at
      FROM marketing_contacts mc
      INNER JOIN marketing_sends ms ON ms.contact_id = mc.id
      WHERE ms.${sql.raw(engagementCol)} IS NOT NULL
        AND mc.status = 'active'
        AND mc.bounced = false
        AND mc.email_status NOT IN ('invalid', 'disposable')
        ${typeClause}
      ORDER BY mc.id
    `);
    contacts = rawContacts.rows.map(mapContact);
    logger.info({ campaignId, effectiveTarget, contactsFound: contacts.length }, "Dispatch contacts loaded (engagement)");
  } else if (effectiveTarget === "new_contacts") {
    const rawContacts = await db.execute<RawContactRow>(
      sql`SELECT * FROM marketing_contacts WHERE is_new = true AND status = 'active' AND bounced = false AND email_status NOT IN ('invalid', 'disposable')`
    );
    contacts = rawContacts.rows.map(mapContact);
    logger.info({ campaignId, effectiveTarget, contactsFound: contacts.length }, "Dispatch contacts loaded (new_contacts)");
  } else {
    const typeFilter = effectiveTarget === "cliente" ? "cliente" : effectiveTarget === "contador" ? "contador" : null;
    const rawContacts = await db.execute<RawContactRow>(
      sql`SELECT * FROM marketing_contacts WHERE status = 'active' AND bounced = false AND email_status NOT IN ('invalid', 'disposable')${typeFilter ? sql` AND type = ${typeFilter}` : sql``}`
    );
    contacts = rawContacts.rows.map(mapContact);
    logger.info({ campaignId, effectiveTarget, contactsFound: contacts.length }, "Dispatch contacts loaded");
  }

  // ── Resume support ────────────────────────────────────────────────────────
  // Query already-sent contact IDs so we can skip them on resume
  const alreadySentRows = await db
    .select({ contactId: marketingSendsTable.contactId })
    .from(marketingSendsTable)
    .where(and(eq(marketingSendsTable.campaignId, campaignId), eq(marketingSendsTable.status, "sent")));
  const sentContactIds = new Set(
    alreadySentRows.map(r => r.contactId).filter((id): id is number => id !== null)
  );
  const alreadySentCount = sentContactIds.size;

  // Delete pending/failed records so they get retried
  await db.delete(marketingSendsTable).where(
    and(
      eq(marketingSendsTable.campaignId, campaignId),
      inArray(marketingSendsTable.status, ["pending", "failed"])
    )
  );

  // Filter out contacts already successfully sent
  const allRemaining = contacts.filter(c => c.id <= 0 || !sentContactIds.has(c.id));

  // ── Ordenação: domínios gratuitos (Gmail, Outlook, Hotmail) vão por último ──
  const normalContacts = allRemaining.filter(c => !isFreeEmail(c.email));
  const freeContacts   = allRemaining.filter(c =>  isFreeEmail(c.email));
  const remaining = [...normalContacts, ...freeContacts];

  // Mark campaign as sending with total count
  await db.update(marketingCampaignsTable).set({
    status: "sending",
    totalContacts: contacts.length,
    totalSent: alreadySentCount,
  }).where(eq(marketingCampaignsTable.id, campaignId));

  let sent = alreadySentCount;
  let bounced = campaign.totalBounced;
  let freeEmailsSentInBatch = 0;
  const FREE_BATCH_SIZE = 20;
  const FREE_BATCH_DELAY_MS = 30_000; // 30 segundos entre lotes

  logger.info({ campaignId, total: contacts.length, alreadySent: alreadySentCount, normal: normalContacts.length, freeEmail: freeContacts.length, remaining: remaining.length }, "Campaign dispatch started");

  async function sendOne(contact: ContactRow): Promise<void> {
    const token = genToken();
    try {
      await db.insert(marketingSendsTable).values({
        campaignId,
        contactId: contact.id > 0 ? contact.id : null,
        recipientEmail: contact.email,
        recipientName: contact.name,
        trackingToken: token,
        status: "pending",
      });
    } catch {
      // Fallback: columns may not exist in production yet — insert without them
      try {
        await db.execute(sql`
          INSERT INTO marketing_sends (campaign_id, contact_id, tracking_token, status)
          VALUES (${campaignId}, ${contact.id > 0 ? contact.id : null}, ${token}, 'pending')
          ON CONFLICT DO NOTHING
        `);
        const check = await db.execute<{ id: number }>(sql`SELECT id FROM marketing_sends WHERE tracking_token = ${token}`);
        if (!check.rows.length) return;
      } catch { return; }
    }

    try {
      await sendMarketingEmail({ campaign, contact, trackingToken: token });
      await db.update(marketingSendsTable).set({ status: "sent", sentAt: new Date() }).where(eq(marketingSendsTable.trackingToken, token));
      sent++;
      await db.update(marketingCampaignsTable).set({ totalSent: sent }).where(eq(marketingCampaignsTable.id, campaignId));
      // Se for campanha de novos contatos, remove a flag após envio bem-sucedido
      if (effectiveTarget === "new_contacts" && contact.id > 0) {
        await db.update(marketingContactsTable).set({ isNew: false }).where(eq(marketingContactsTable.id, contact.id));
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await db.update(marketingSendsTable).set({ status: "failed", error }).where(eq(marketingSendsTable.trackingToken, token));
      bounced++;
      logger.warn({ email: contact.email, error }, "Failed to send marketing email");
      if (contact.id > 0) {
        const isPermanentBounce = /550|551|552|553|554|user.unknown|does not exist|invalid|no such user|mailbox.*not.*found|bounce/i.test(error);
        if (isPermanentBounce) {
          await db.update(marketingContactsTable).set({ bounced: true }).where(eq(marketingContactsTable.id, contact.id));
          logger.info({ contactId: contact.id, email: contact.email }, "Contato marcado como bloqueado por bounce permanente");
        }
      }
    }
  }

  for (const contact of remaining) {
    const isFree = isFreeEmail(contact.email);

    // Throttling especial para domínios gratuitos: lotes de 5 com 60s de pausa
    if (isFree) {
      if (freeEmailsSentInBatch > 0 && freeEmailsSentInBatch % FREE_BATCH_SIZE === 0) {
        logger.info({ campaignId, freeEmailsSentInBatch }, `Gmail/Outlook batch completo — aguardando ${FREE_BATCH_DELAY_MS / 1000}s`);
        await new Promise(r => setTimeout(r, FREE_BATCH_DELAY_MS));
      }
      await sendOne(contact);
      freeEmailsSentInBatch++;
      // Delay de 2s entre cada email de domínio gratuito
      await new Promise(r => setTimeout(r, 2_000));
    } else {
      await sendOne(contact);
      await new Promise(r => setTimeout(r, 100));
    }
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

router.delete("/marketing/replies/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(marketingRepliesTable).where(eq(marketingRepliesTable.id, id));
  res.json({ message: "Mensagem excluída." });
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
