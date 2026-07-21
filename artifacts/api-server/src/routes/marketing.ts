import { Router } from "express";
import { eq, desc, ilike, or, sql, and, isNull, ne, inArray, notInArray } from "drizzle-orm";
import { randomBytes, randomUUID } from "crypto";
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

// Ports tried in order: 25 (standard MTA), 587 (submission), 465 (SMTPS plain-text probe)
// Some providers block 25 and only expose 587/465 for inbound verification
const SMTP_PORTS = [25, 587, 465];

async function smtpVerifyMailbox(email: string, mxHost: string, port: number): Promise<"valid" | "invalid" | "unknown"> {
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

    const socket = net.createConnection({ host: mxHost, port });
    socket.setTimeout(3000);
    socket.setEncoding("utf8");

    socket.on("timeout", () => finish("unknown"));
    socket.on("error", () => finish("unknown"));
    socket.on("close", () => finish("unknown"));

    socket.on("data", (chunk: string) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const code = parseInt(line.slice(0, 3), 10);
        const isFinal = line[3] !== "-";
        if (!isFinal) continue;

        if (step === 0) {
          if (code === 220) { socket.write("EHLO mail-verify.local\r\n"); step = 1; }
          else { finish("unknown"); }
        } else if (step === 1) {
          if (code === 250) { socket.write("MAIL FROM:<verify@mail-verify.local>\r\n"); step = 2; }
          else { finish("unknown"); }
        } else if (step === 2) {
          if (code === 250) { socket.write(`RCPT TO:<${email}>\r\n`); step = 3; }
          else { finish("unknown"); }
        } else if (step === 3) {
          if (code === 250 || code === 251) { finish("valid"); }
          else if (code >= 550 && code <= 554) { finish("invalid"); }
          else { finish("unknown"); }
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

  // Try first MX host × ports 25, 587, 465
  const host = mxHosts[0];
  for (const port of SMTP_PORTS) {
    const result = await smtpVerifyMailbox(email, host, port);
    if (result !== "unknown") {
      smtpCache.set(email, { result, ts: Date.now() });
      return result;
    }
  }

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
// Resolve contactId pelo token — aceita token estável do contato OU tracking token por-envio
async function resolveContactIdFromToken(token: string): Promise<{ contactId: number | null; found: boolean }> {
  // 1ª tentativa: token estável por contato (unsub_token)
  const [byContact] = await db
    .select({ id: marketingContactsTable.id })
    .from(marketingContactsTable)
    .where(eq(marketingContactsTable.unsubToken, token))
    .limit(1);
  if (byContact) return { contactId: byContact.id, found: true };

  // 2ª tentativa: tracking token por-envio (retrocompatibilidade)
  const [bySend] = await db
    .select({ contactId: marketingSendsTable.contactId })
    .from(marketingSendsTable)
    .where(eq(marketingSendsTable.trackingToken, token))
    .limit(1);
  if (bySend) return { contactId: bySend.contactId, found: true };

  return { contactId: null, found: false };
}

async function doUnsubscribe(token: string): Promise<{ ok: boolean; already: boolean; found: boolean }> {
  const { contactId, found } = await resolveContactIdFromToken(token);
  if (!found) return { ok: false, already: false, found: false };
  if (!contactId) return { ok: true, already: true, found: true }; // sem contactId (contato deletado) — tratar como ok

  const result = await db.execute<{ updated: number }>(sql`
    WITH updated AS (
      UPDATE marketing_contacts
      SET status = 'unsubscribed', unsubscribed_at = NOW()
      WHERE id = ${contactId}
        AND status != 'unsubscribed'
      RETURNING 1
    )
    SELECT count(*)::int AS updated FROM updated
  `);
  const already = (result.rows[0]?.updated ?? 0) === 0;
  return { ok: true, already, found: true };
}

// GET — chamado pelo frontend /unsubscribe (link no corpo do email)
router.get("/marketing/unsubscribe", async (req, res): Promise<void> => {
  const token = req.query.token as string | undefined;
  if (!token) { res.status(400).json({ error: "Token ausente." }); return; }

  const result = await doUnsubscribe(token);
  if (!result.found) { res.status(404).json({ error: "Link inválido ou expirado." }); return; }

  res.json({ message: "Descadastro realizado com sucesso.", already: result.already });
});

// POST — RFC 8058 one-click unsubscribe (Gmail, Yahoo, Outlook enviam POST silencioso)
// Body: application/x-www-form-urlencoded  →  List-Unsubscribe=One-Click
router.post("/marketing/unsubscribe", async (req, res): Promise<void> => {
  const token = (req.query.token ?? (req.body as Record<string, string>)?.token) as string | undefined;
  if (!token) { res.status(200).send("ok"); return; } // 200 mesmo sem token — não expor erro

  await doUnsubscribe(token); // idempotente: sempre 200 independente do resultado
  res.status(200).send("ok");
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
// WhatsApp webhook paths are handled by whatsappMarketingRouter — skip auth for them
router.use("/marketing", (req, res, next) => {
  if (req.path.startsWith("/wa/webhook/")) return next("router");
  requireAdmin(req, res, next);
});

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

// ─── Provider breakdown ───────────────────────────────────────────────────────
router.get("/marketing/contacts/provider-stats", async (req, res): Promise<void> => {
  const type = req.query.type as string | undefined;

  const conditions = type ? [eq(marketingContactsTable.type, type)] : [];
  const where = conditions.length > 0 ? conditions[0] : undefined;

  const rows = await db
    .select({ email: marketingContactsTable.email })
    .from(marketingContactsTable)
    .where(where);

  const PROVIDERS: Record<string, Set<string>> = {
    gmail:   new Set(["gmail.com", "googlemail.com"]),
    outlook: new Set(["outlook.com", "hotmail.com", "hotmail.com.br", "live.com", "msn.com"]),
    yahoo:   new Set(["yahoo.com", "yahoo.com.br", "yahoo.com.ar", "ymail.com"]),
    uolbol:  new Set(["uol.com.br", "bol.com.br"]),
  };

  const counts: Record<string, number> = { gmail: 0, outlook: 0, yahoo: 0, uolbol: 0, outros: 0 };

  for (const row of rows) {
    const domain = row.email?.split("@")[1]?.toLowerCase() ?? "";
    let matched = false;
    for (const [key, domains] of Object.entries(PROVIDERS)) {
      if (domains.has(domain)) { counts[key]++; matched = true; break; }
    }
    if (!matched) counts["outros"]++;
  }

  res.json({ total: rows.length, ...counts });
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
  if (status === "bounced") conditions.push(eq(marketingContactsTable.bounced, true));
  else if (status) conditions.push(eq(marketingContactsTable.status, status));
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

// ─── Export contacts as XLSX ──────────────────────────────────────────────────
router.get("/marketing/contacts/export", async (req, res): Promise<void> => {
  const search = req.query.search as string | undefined;
  const status = req.query.status as string | undefined;
  const type = req.query.type as string | undefined;
  const emailStatus = req.query.emailStatus as string | undefined;
  const isNewFilter = req.query.isNew as string | undefined;
  const bounced = req.query.bounced as string | undefined;

  const conditions = [];
  if (search) conditions.push(or(ilike(marketingContactsTable.name, `%${search}%`), ilike(marketingContactsTable.email, `%${search}%`)));
  if (status) conditions.push(eq(marketingContactsTable.status, status));
  if (type) conditions.push(eq(marketingContactsTable.type, type));
  if (emailStatus) conditions.push(eq(marketingContactsTable.emailStatus, emailStatus));
  if (isNewFilter === "true") conditions.push(eq(marketingContactsTable.isNew, true));
  if (bounced === "true") conditions.push(eq(marketingContactsTable.bounced, true));
  else if (bounced === "had") conditions.push(eq(marketingContactsTable.hadBounce, true));

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db.select().from(marketingContactsTable).where(where).orderBy(desc(marketingContactsTable.createdAt));

  const EMAIL_STATUS_LABELS: Record<string, string> = {
    unknown: "Não validado", valid: "Válido", invalid: "Inválido", disposable: "Descartável",
  };
  const INVALID_REASON_LABELS: Record<string, string> = {
    bad_format: "Formato inválido", no_mx: "Sem servidor MX", disposable_domain: "Domínio descartável",
  };

  const sheetData = rows.map(r => ({
    "Nome": r.name,
    "E-mail": r.email,
    "Telefone": r.phone ?? "",
    "Tipo": r.type === "contador" ? "Contador" : "Cliente",
    "Status": r.bounced ? "Bounce" : r.status === "unsubscribed" ? "Descadastrado" : "Ativo",
    "E-mail Válido": EMAIL_STATUS_LABELS[r.emailStatus] ?? r.emailStatus,
    "Motivo Inválido": r.emailInvalidReason ? (INVALID_REASON_LABELS[r.emailInvalidReason] ?? r.emailInvalidReason) : "",
    "Tags": r.tags ?? "",
    "Bounce Anterior": r.hadBounce ? "Sim" : "Não",
    "Novo": r.isNew ? "Sim" : "Não",
    "Cadastrado em": r.createdAt ? new Date(r.createdAt).toLocaleDateString("pt-BR") : "",
  }));

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(sheetData);
  xlsx.utils.book_append_sheet(wb, ws, "Contatos");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

  const filename = `contatos_${type ?? "todos"}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
});

router.post("/marketing/contacts", async (req, res): Promise<void> => {
  const { name, email, phone, tags, type } = req.body ?? {};
  if (!name || !email) { res.status(400).json({ error: "Nome e e-mail são obrigatórios." }); return; }
  const contactType = type === "contador" ? "contador" : "cliente";
  try {
    const [contact] = await db.insert(marketingContactsTable).values({ name, email: email.toLowerCase().trim(), phone, tags, type: contactType, unsubToken: randomUUID() }).returning();
    res.status(201).json(contact);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
      res.status(409).json({ error: "Este e-mail já está cadastrado como " + contactType + "." });
      return;
    }
    throw err;
  }
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
      // Auto-detecta separador: tab, ponto-e-vírgula (Excel BR) ou vírgula
      const firstLine = text.split(/\r?\n/)[0] ?? "";
      const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
      records = parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true, delimiter, relax_column_count: true }) as Record<string, string>[];
    }
  } catch {
    res.status(400).json({ error: "Arquivo inválido. Use CSV ou XLSX." }); return;
  }

  // Extrai o celular quando o campo tem múltiplos números (ex: "68-32244109,68-992058586")
  // Celular BR: DDD (2 dígitos) + 9 dígitos começando com 9 = 11 dígitos total
  function extractCelular(raw: string): string | undefined {
    const candidates = raw.split(/[,/|;]+/).map(s => s.replace(/\D/g, ""));
    const mobiles = candidates.filter(n => n.length === 11 && n[2] === "9");
    if (mobiles.length > 0) return mobiles[0];
    // fallback: qualquer número com DDD (10 ou 11 dígitos)
    const any = candidates.filter(n => n.length === 10 || n.length === 11);
    if (any.length > 0) return any[0];
    // fallback final: qualquer coisa não vazia
    const fallback = candidates.find(n => n.length >= 8);
    return fallback ?? undefined;
  }

  type ContactRow = { name: string; email: string; phone?: string; tags?: string; type: string; isNew: boolean; unsubToken: string };
  const validRows: ContactRow[] = [];
  let parseSkipped = 0;

  // Loga os cabeçalhos encontrados para diagnóstico
  if (records.length > 0) {
    logger.info({ headers: Object.keys(records[0]), total: records.length }, "Import: cabeçalhos detectados");
  }

  for (const row of records) {
    // Normaliza chaves: trim + lowercase para comparação tolerante a espaços e capitalização
    const normalizedRow: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      normalizedRow[k.trim().toLowerCase()] = String(v ?? "");
    }
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const val = normalizedRow[k.trim().toLowerCase()];
        if (val !== undefined && val !== "") return val;
      }
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
    let rawPhone = pick(
      "Telefone","telefone","TELEFONE",
      "Fone","fone","FONE",
      "Tel","tel","TEL",
      "Cel","cel","CEL",
      "phone","Phone","PHONE",
      "Celular","celular","CELULAR",
      "Whatsapp","whatsapp","WHATSAPP","WhatsApp",
      "Telefone Celular","telefone celular","TELEFONE CELULAR",
      "Tel. Celular","tel. celular",
      "Telefone 1","telefone 1",
      "Telefones","telefones",
    );
    // Fallback: procura qualquer coluna cujo nome contenha "tel", "cel", "fone" ou "whats"
    if (!rawPhone) {
      const phoneKey = Object.keys(normalizedRow).find(k =>
        /tel|cel|fone|whats|phone/.test(k) && normalizedRow[k] !== ""
      );
      if (phoneKey) rawPhone = normalizedRow[phoneKey];
    }
    const phone = rawPhone ? (extractCelular(rawPhone) ?? undefined) : undefined;
    const estado = pick("Estado","estado","ESTADO","UF","uf");
    const cidade = pick("Cidade","cidade","CIDADE","Município","municipio");
    const rawTags = pick("Tags","tags","TAGS");
    const tagsArr = [rawTags, estado, cidade].filter(Boolean);
    const tags = tagsArr.length > 0 ? tagsArr.join(", ") : undefined;
    const rowType = pick("Tipo","tipo","type","Type");
    const finalType = (rowType === "contador" || rowType === "cliente") ? rowType : contactType;

    if (!email || !name) { parseSkipped++; continue; }
    validRows.push({ name, email, phone, tags, type: finalType, isNew: true, unsubToken: randomUUID() });
  }

  // Log diagnóstico: primeiros 3 registros com phone detectado
  const sample = validRows.filter(r => r.phone).slice(0, 3);
  logger.info({ sample, totalWithPhone: validRows.filter(r => r.phone).length, totalRows: validRows.length }, "Import: amostra de phones detectados");

  // Responde imediatamente para não sofrer timeout do proxy (VPS)
  res.json({ started: true, total: records.length, valid: validRows.length, skipped: parseSkipped });

  // Processa inserções em background (lotes de 500)
  const BATCH = 500;
  (async () => {
    for (let i = 0; i < validRows.length; i += BATCH) {
      const batch = validRows.slice(i, i + BATCH);
      // Garante que todas as linhas têm phone e tags como null (não undefined)
      const normalizedBatch = batch.map(r => ({ ...r, phone: r.phone ?? null, tags: r.tags ?? null }));
      try {
        await db.insert(marketingContactsTable).values(normalizedBatch).onConflictDoUpdate({
          target: [marketingContactsTable.email, marketingContactsTable.type],
          set: {
            name: sql.raw(`EXCLUDED.name`),
            phone: sql.raw(`CASE WHEN EXCLUDED.phone IS NOT NULL AND EXCLUDED.phone != '' THEN EXCLUDED.phone ELSE marketing_contacts.phone END`),
            tags: sql.raw(`CASE WHEN EXCLUDED.tags IS NOT NULL AND EXCLUDED.tags != '' THEN EXCLUDED.tags ELSE marketing_contacts.tags END`),
            // preserva o token estável existente; atribui novo apenas se ainda não tiver
            unsubToken: sql.raw(`CASE WHEN marketing_contacts.unsub_token IS NULL THEN EXCLUDED.unsub_token ELSE marketing_contacts.unsub_token END`),
          },
        });
      } catch (batchErr) {
        logger.warn({ err: batchErr, batchStart: i }, "Import: batch falhou, tentando linha a linha");
        for (const row of normalizedBatch) {
          try {
            await db.insert(marketingContactsTable).values(row).onConflictDoUpdate({
              target: [marketingContactsTable.email, marketingContactsTable.type],
              set: {
                name: sql.raw(`EXCLUDED.name`),
                phone: sql.raw(`CASE WHEN EXCLUDED.phone IS NOT NULL AND EXCLUDED.phone != '' THEN EXCLUDED.phone ELSE marketing_contacts.phone END`),
                tags: sql.raw(`CASE WHEN EXCLUDED.tags IS NOT NULL AND EXCLUDED.tags != '' THEN EXCLUDED.tags ELSE marketing_contacts.tags END`),
                unsubToken: sql.raw(`CASE WHEN marketing_contacts.unsub_token IS NULL THEN EXCLUDED.unsub_token ELSE marketing_contacts.unsub_token END`),
              },
            });
          } catch { /* ignora erros individuais */ }
        }
      }
    }
    logger.info({ total: validRows.length }, "Import background: concluído");
  })().catch(err => logger.error({ err }, "Import background: erro"));
});

// ── In-memory validation job state ────────────────────────────────────────────
interface ValidationJob {
  total: number;
  processed: number;
  valid: number;
  invalid: number;
  disposable: number;
  badFormat: number;
  noMx: number;
  skipped: number;
  zeroBounce: boolean;
  done: boolean;
  startedAt: number;
}
let validationJob: ValidationJob | null = null;

router.get("/marketing/contacts/validate/status", (_req, res): void => {
  if (!validationJob) { res.json({ running: false }); return; }
  res.json({ running: !validationJob.done, ...validationJob });
});

router.post("/marketing/contacts/validate", async (req, res): Promise<void> => {
  // If a job is already running, return its current status
  if (validationJob && !validationJob.done) {
    res.json({ running: true, ...validationJob });
    return;
  }

  const BATCH_SIZE = 200;   // contacts fetched per iteration
  const CONCURRENCY = 5;    // concurrent SMTP connections (keep low to avoid rate limits)
  const typeFilter = req.body?.type;

  const conditions = [eq(marketingContactsTable.emailStatus, "unknown")];
  if (typeFilter && typeFilter !== "all") conditions.push(eq(marketingContactsTable.type, typeFilter));

  // Count total unknown contacts upfront so the UI shows accurate progress
  const [{ count: totalCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(marketingContactsTable)
    .where(and(...conditions));

  const zbKey = await getZeroBounceApiKey();

  validationJob = {
    total: totalCount, processed: 0, valid: 0, invalid: 0,
    disposable: 0, badFormat: 0, noMx: 0, skipped: 0,
    zeroBounce: !!zbKey, done: false, startedAt: Date.now(),
  };

  // Respond immediately — processing runs in background
  res.json({ started: true, total: totalCount, zeroBounce: !!zbKey });

  // ── Background processing — loops until no unknown contacts remain ─────────
  (async () => {
    // Detect if ALL SMTP ports are blocked once — reuse result for all contacts
    let smtpBlocked = false;
    if (!zbKey) {
      // Fetch a few contacts and find the first one that is NOT a catch-all domain
      // (catch-all domains like Gmail can't be probed — they always accept RCPT TO)
      const probeContacts = await db
        .select({ email: marketingContactsTable.email })
        .from(marketingContactsTable)
        .where(and(...conditions))
        .limit(20);
      const probe = probeContacts.find(c => {
        const d = c.email.split("@")[1]?.toLowerCase();
        return d && !CATCHALL_DOMAINS.has(d);
      });
      if (probe) {
        const d = probe.email.split("@")[1].toLowerCase();
        const hosts = await getMxHosts(d);
        if (hosts.length) {
          let anyPortWorked = false;
          for (const port of SMTP_PORTS) {
            const r = await smtpVerifyMailbox(probe.email, hosts[0], port);
            if (r !== "unknown") { anyPortWorked = true; break; }
          }
          if (!anyPortWorked) smtpBlocked = true;
        }
      } else {
        // All contacts in first 20 are catch-all — treat as blocked to skip SMTP
        smtpBlocked = true;
      }
    }

    // IDs that returned SMTP "unknown" (timeout) — kept as "unknown" in DB,
    // excluded from future batches so the loop doesn't retry them endlessly.
    const unresolvableIds: number[] = [];

    // Keep fetching and processing batches until none remain
    while (true) {
      if (!validationJob) break;

      const batchWhere = unresolvableIds.length > 0
        ? and(...conditions, notInArray(marketingContactsTable.id, unresolvableIds))
        : and(...conditions);

      const batch = await db
        .select({ id: marketingContactsTable.id, email: marketingContactsTable.email })
        .from(marketingContactsTable)
        .where(batchWhere)
        .limit(BATCH_SIZE);

      if (batch.length === 0) break; // all done

      // Update total: remaining resolvable + already processed
      const [{ count: remaining }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(marketingContactsTable)
        .where(batchWhere);
      validationJob.total = validationJob.processed + remaining;

      // Process contacts in parallel (CONCURRENCY workers pulling from the batch)
      let batchIdx = 0;
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, batch.length) }, async () => {
          while (true) {
            if (!validationJob) break;
            const contact = batch[batchIdx++];
            if (!contact) break;
            try {
              const domain = contact.email.includes("@") ? contact.email.split("@")[1].toLowerCase() : "";
              let status: "valid" | "invalid" | "disposable";
              let reason: string | null = null;
              let smtpUnresolvable = false;

              if (!EMAIL_REGEX.test(contact.email)) {
                status = "invalid"; reason = "bad_format"; validationJob.badFormat++;
              } else if (DISPOSABLE_DOMAINS.has(domain)) {
                status = "disposable"; reason = "disposable_domain"; validationJob.disposable++;
              } else if (zbKey) {
                status = await validateEmailZeroBounce(contact.email, zbKey);
                if (status === "valid") validationJob.valid++;
                else if (status === "disposable") { validationJob.disposable++; reason = "disposable_domain"; }
                else { validationJob.noMx++; reason = "zerobounce_invalid"; }
              } else {
                const hosts = await getMxHosts(domain);
                if (!hosts.length) {
                  status = "invalid"; reason = "no_mx"; validationJob.noMx++;
                } else if (CATCHALL_DOMAINS.has(domain) || smtpBlocked) {
                  // Catch-all or network-level SMTP block: MX confirms existence
                  status = "valid"; validationJob.valid++;
                } else {
                  const smtpResult = await validateEmailSmtp(contact.email);
                  if (smtpResult === "invalid") {
                    status = "invalid"; reason = "smtp_invalid"; validationJob.noMx++;
                  } else if (smtpResult === "unknown") {
                    // SMTP timed out — can't determine validity; leave as "unknown"
                    smtpUnresolvable = true;
                    unresolvableIds.push(contact.id);
                    validationJob.skipped++;
                    validationJob.processed++;
                  } else {
                    status = "valid"; validationJob.valid++;
                  }
                }
              }

              if (smtpUnresolvable) continue;

              await db.update(marketingContactsTable)
                .set({ emailStatus: status!, emailInvalidReason: reason, emailValidatedAt: new Date() })
                .where(eq(marketingContactsTable.id, contact.id));

              if (status! === "invalid" || status! === "disposable") validationJob.invalid++;
              validationJob.processed++;
            } catch {
              validationJob.skipped++;
              validationJob.processed++;
            }
          }
        })
      );
    }

    if (validationJob) validationJob.done = true;
    logger.info({ ...validationJob }, "Email validation job completed");
  })().catch(err => {
    logger.error({ err }, "Email validation background job error");
    if (validationJob) validationJob.done = true;
  });
});

router.patch("/marketing/contacts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { name, email, phone, status, tags } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (email !== undefined) {
    updates.email = String(email).toLowerCase().trim();
    updates.emailStatus = "unknown";
    updates.emailValidatedAt = null;
    updates.emailInvalidReason = null;
  }
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
  const { name, subject, bodyHtml, bodyText, fromName, fromEmail, replyTo, scheduledAt, filterTags, targetType, sendLimit } = req.body ?? {};
  if (!name || !subject || !bodyHtml) { res.status(400).json({ error: "Nome, assunto e corpo são obrigatórios." }); return; }
  const [campaign] = await db.insert(marketingCampaignsTable).values({
    name, subject, bodyHtml, bodyText,
    fromName: fromName ?? "LealCert Marketing",
    fromEmail: fromEmail ?? "mkt@lealcert.com.br",
    replyTo, filterTags,
    targetType: (["cliente","contador","new_contacts","not_opened_cliente","not_opened_contador","opened_all","opened_cliente","opened_contador","clicked_all","clicked_cliente","clicked_contador"].includes(targetType)) ? targetType : "all",
    sendLimit: sendLimit && Number(sendLimit) > 0 ? Number(sendLimit) : null,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    status: scheduledAt ? "scheduled" : "draft",
  }).returning();
  res.status(201).json(campaign);
});

router.put("/marketing/campaigns/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { name, subject, bodyHtml, bodyText, fromName, fromEmail, replyTo, scheduledAt, filterTags, targetType, sendLimit } = req.body ?? {};
  const [campaign] = await db.update(marketingCampaignsTable).set({
    name, subject, bodyHtml, bodyText, fromName, fromEmail, replyTo, filterTags,
    targetType: (["cliente","contador","new_contacts","not_opened_cliente","not_opened_contador","opened_all","opened_cliente","opened_contador","clicked_all","clicked_cliente","clicked_contador"].includes(targetType)) ? targetType : "all",
    sendLimit: sendLimit !== undefined ? (sendLimit && Number(sendLimit) > 0 ? Number(sendLimit) : null) : undefined,
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
  const { scheduledAt, targetOverride, specificContactIds, manualRecipients, sendBatchSize, sendIntervalSecs, sendStartHour, sendEndHour, sendDays, dispatchFrom, dispatchTo, includedProviders } = req.body ?? {};

  const [campaign] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Campanha não encontrada." }); return; }
  if (campaign.status === "sending") {
    res.status(400).json({ error: "Campanha em andamento, aguarde concluir." }); return;
  }

  const dispatchOpts: DispatchOptions = {};
  const validTargets = [
    "all", "cliente", "contador", "specific", "manual",
    "new_contacts", "new_cliente", "new_contador",
    "opened_all", "opened_cliente", "opened_contador",
    "clicked_all", "clicked_cliente", "clicked_contador",
    "not_opened_cliente", "not_opened_contador",
  ];
  if (targetOverride && validTargets.includes(targetOverride)) {
    dispatchOpts.targetOverride = targetOverride as DispatchOptions["targetOverride"];
  }
  if (Array.isArray(specificContactIds) && specificContactIds.length > 0) {
    dispatchOpts.specificContactIds = specificContactIds.map(Number);
  }
  if (Array.isArray(manualRecipients) && manualRecipients.length > 0) {
    dispatchOpts.manualRecipients = manualRecipients;
  }
  if (sendBatchSize && Number(sendBatchSize) > 0) {
    dispatchOpts.sendBatchSize = Number(sendBatchSize);
  }
  if (sendIntervalSecs && Number(sendIntervalSecs) > 0) {
    dispatchOpts.sendIntervalSecs = Number(sendIntervalSecs);
  }
  if (sendStartHour != null && sendEndHour != null) {
    dispatchOpts.sendStartHour = Number(sendStartHour);
    dispatchOpts.sendEndHour = Number(sendEndHour);
  }
  if (sendDays) dispatchOpts.sendDays = String(sendDays);
  if (dispatchFrom && Number(dispatchFrom) >= 1) dispatchOpts.dispatchFrom = Number(dispatchFrom);
  if (dispatchTo && Number(dispatchTo) >= 1) dispatchOpts.dispatchTo = Number(dispatchTo);
  const VALID_PROVIDERS: ProviderKey[] = ["outros", "gmail", "outlook", "yahoo", "uolbol"];
  if (Array.isArray(includedProviders) && includedProviders.length > 0) {
    dispatchOpts.includedProviders = includedProviders.filter((p: unknown) => VALID_PROVIDERS.includes(p as ProviderKey)) as ProviderKey[];
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
      // Salvar configurações de rate-limiting para que o scheduler as use ao disparar
      sendBatchSize: dispatchOpts.sendBatchSize ?? null,
      sendIntervalSecs: dispatchOpts.sendIntervalSecs ?? null,
      sendStartHour: dispatchOpts.sendStartHour ?? null,
      sendEndHour: dispatchOpts.sendEndHour ?? null,
      sendDays: dispatchOpts.sendDays ?? null,
    }).where(eq(marketingCampaignsTable.id, id));
    res.json({ message: `Campanha agendada para ${new Date(scheduledAt).toLocaleString("pt-BR")}.` });
    return;
  }

  if (campaign.status === "sent") {
    await db.delete(marketingSendsTable).where(eq(marketingSendsTable.campaignId, id));
  }

  // Save opts to DB so resume-after-restart can reconstruct them correctly
  await db.update(marketingCampaignsTable).set({
    status: "sending",
    totalSent: 0, totalDelivered: 0, totalOpened: 0, totalClicked: 0, totalBounced: 0, totalReplied: 0,
    sentAt: null,
    sendBatchSize: dispatchOpts.sendBatchSize ?? null,
    sendIntervalSecs: dispatchOpts.sendIntervalSecs ?? null,
    sendStartHour: dispatchOpts.sendStartHour ?? null,
    sendEndHour: dispatchOpts.sendEndHour ?? null,
    sendDays: dispatchOpts.sendDays ?? null,
    scheduledTargetOverride: dispatchOpts.targetOverride ?? null,
    scheduledContactIds: dispatchOpts.specificContactIds?.length
      ? JSON.stringify(dispatchOpts.specificContactIds) : null,
    scheduledManualRecipients: dispatchOpts.manualRecipients?.length
      ? JSON.stringify(dispatchOpts.manualRecipients) : null,
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

// ── Pause / active-dispatch state (in-memory) ────────────────────────────────
const pausedCampaigns = new Set<number>();
// Tracks which campaignIds have a live dispatch loop in this process.
// Used by resume to avoid starting a duplicate loop when the original is alive.
const activeDispatches = new Set<number>();

router.post("/marketing/campaigns/:id/cancel", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  // ADD to pausedCampaigns so any running loop hits waitIfPaused(),
  // checks DB (status will be "draft"), and exits cleanly.
  pausedCampaigns.add(id);
  await db.update(marketingCampaignsTable).set({ status: "draft", scheduledAt: null }).where(eq(marketingCampaignsTable.id, id));
  // If no loop is running, clean up immediately so a fresh send can start.
  if (!activeDispatches.has(id)) {
    pausedCampaigns.delete(id);
  }
  res.json({ message: "Campanha cancelada." });
});

router.post("/marketing/campaigns/:id/pause", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [campaign] = await db.select({ status: marketingCampaignsTable.status })
    .from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Campanha não encontrada." }); return; }
  if (campaign.status !== "sending") { res.status(400).json({ error: "Campanha não está em andamento." }); return; }
  pausedCampaigns.add(id);
  await db.update(marketingCampaignsTable).set({ status: "paused" }).where(eq(marketingCampaignsTable.id, id));
  res.json({ message: "Campanha pausada." });
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
  const [campaign] = await db.select()
    .from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Campanha não encontrada." }); return; }
  if (campaign.status !== "paused" && campaign.status !== "sending") {
    res.status(400).json({ error: "Campanha não está pausada ou em andamento." }); return;
  }

  // Wake up the existing loop (if still alive in this process)
  pausedCampaigns.delete(id);
  await db.update(marketingCampaignsTable).set({ status: "sending" }).where(eq(marketingCampaignsTable.id, id));
  res.json({ message: "Retomando envio…" });

  // Only start a fresh dispatch if no loop is alive (e.g. server restarted)
  if (!activeDispatches.has(id)) {
    // Reconstruct opts from what was saved in the DB at send time
    const opts: DispatchOptions = {};
    if (campaign.scheduledTargetOverride) {
      opts.targetOverride = campaign.scheduledTargetOverride as DispatchOptions["targetOverride"];
    }
    if (campaign.scheduledContactIds) {
      try { opts.specificContactIds = JSON.parse(campaign.scheduledContactIds); } catch { /* ignore */ }
    }
    if (campaign.scheduledManualRecipients) {
      try { opts.manualRecipients = JSON.parse(campaign.scheduledManualRecipients); } catch { /* ignore */ }
    }
    if (campaign.sendBatchSize) opts.sendBatchSize = campaign.sendBatchSize;
    if (campaign.sendIntervalSecs) opts.sendIntervalSecs = campaign.sendIntervalSecs;
    if (campaign.sendStartHour != null) opts.sendStartHour = campaign.sendStartHour;
    if (campaign.sendEndHour != null) opts.sendEndHour = campaign.sendEndHour;
    if (campaign.sendDays) opts.sendDays = campaign.sendDays;
    dispatchCampaign(id, opts).catch(err => logger.error({ campaignId: id, err }, "Resume dispatch error"));
  }
});

// ─── Campaign Dispatch ────────────────────────────────────────────────────────
export interface DispatchOptions {
  targetOverride?: "all" | "cliente" | "contador" | "specific" | "manual"
    | "new_contacts" | "new_cliente" | "new_contador"
    | "opened_all" | "opened_cliente" | "opened_contador"
    | "clicked_all" | "clicked_cliente" | "clicked_contador"
    | "not_opened_cliente" | "not_opened_contador";
  specificContactIds?: number[];
  manualRecipients?: { name: string; email: string }[];
  sendBatchSize?: number;
  sendIntervalSecs?: number;
  sendStartHour?: number;
  sendEndHour?: number;
  sendDays?: string;
  /** Posição inicial 1-based na lista ordenada por id ASC (ex: 250 = pula os 249 primeiros) */
  dispatchFrom?: number;
  /** Posição final 1-based inclusiva (ex: 3000 = vai até o 3000º contato) */
  dispatchTo?: number;
  /**
   * Provedores permitidos neste disparo.
   * Se omitido ou vazio → envia para TODOS os provedores.
   * Se preenchido → apenas os provedores listados recebem. Os demais têm fila zerada antes do envio.
   */
  includedProviders?: ProviderKey[];
}

// ── Horário comercial auto-resume scheduler (roda a cada 60s) ────────────────
setInterval(async () => {
  try {
    const paused = await db
      .select({ id: marketingCampaignsTable.id, startHour: marketingCampaignsTable.sendStartHour, endHour: marketingCampaignsTable.sendEndHour, days: marketingCampaignsTable.sendDays })
      .from(marketingCampaignsTable)
      .where(eq(marketingCampaignsTable.status, "paused"));
    for (const c of paused) {
      if (c.startHour == null || c.endHour == null) continue;
      if (!isWithinBusinessHours(c.startHour, c.endHour, c.days ?? undefined)) continue;
      // Within hours → resume
      pausedCampaigns.delete(c.id);
      await db.update(marketingCampaignsTable).set({ status: "sending" }).where(eq(marketingCampaignsTable.id, c.id));
      dispatchCampaign(c.id, { sendStartHour: c.startHour, sendEndHour: c.endHour, sendDays: c.days ?? undefined })
        .catch(err => logger.error({ campaignId: c.id, err }, "Business hours auto-resume error"));
      logger.info({ campaignId: c.id }, "Horário comercial: campanha retomada automaticamente");
    }
  } catch (err) { logger.warn({ err }, "Business hours scheduler error"); }
}, 60_000);

function isWithinBusinessHours(startHour: number, endHour: number, days?: string): boolean {
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

type ContactRow = { id: number; name: string; email: string; phone: string | null; type: string; status: string; bounced: boolean; hadBounce: boolean; isNew: boolean; tags: string | null; emailStatus: string; emailInvalidReason: string | null; emailValidatedAt: Date | null; unsubscribedAt: Date | null; unsubToken: string | null; createdAt: Date };
type RawContactRow = { id: number; name: string; email: string; phone: string | null; type: string; status: string; bounced: boolean; had_bounce: boolean; is_new: boolean; tags: string | null; email_status: string; email_invalid_reason: string | null; email_validated_at: Date | null; unsubscribed_at: Date | null; unsub_token: string | null; created_at: Date };

// ── Filas de provedores (regras fixas — não editáveis pelo painel) ────────────
const PROVIDER_QUEUES = {
  gmail:   { domains: new Set(["gmail.com", "googlemail.com"]),                                    batchSize: 1000, pauseMs: 120_000 },
  outlook: { domains: new Set(["outlook.com", "hotmail.com", "hotmail.com.br", "live.com", "msn.com"]), batchSize: 1500, pauseMs: 120_000 },
  yahoo:   { domains: new Set(["yahoo.com", "yahoo.com.br", "yahoo.com.ar", "ymail.com"]),          batchSize: 1000, pauseMs:  60_000 },
  uolbol:  { domains: new Set(["uol.com.br", "bol.com.br"]),                                        batchSize: 2000, pauseMs:  60_000 },
} as const;

type ProviderKey = keyof typeof PROVIDER_QUEUES | "outros";

function getProviderKey(email: string): ProviderKey {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  for (const [key, cfg] of Object.entries(PROVIDER_QUEUES)) {
    if ((cfg.domains as Set<string>).has(domain)) return key as ProviderKey;
  }
  return "outros";
}

function mapContact(r: RawContactRow): ContactRow {
  return {
    id: r.id, name: r.name, email: r.email, phone: r.phone, type: r.type, status: r.status,
    bounced: r.bounced, hadBounce: r.had_bounce ?? false, isNew: r.is_new ?? false, tags: r.tags, emailStatus: r.email_status,
    emailInvalidReason: r.email_invalid_reason, emailValidatedAt: r.email_validated_at,
    unsubscribedAt: r.unsubscribed_at, unsubToken: r.unsub_token ?? null, createdAt: r.created_at,
  };
}

export async function dispatchCampaign(campaignId: number, opts: DispatchOptions = {}) {
  // Guard: prevent two loops for the same campaign running simultaneously
  if (activeDispatches.has(campaignId)) {
    logger.warn({ campaignId }, "dispatchCampaign: loop já ativo — ignorando chamada duplicada");
    return;
  }
  activeDispatches.add(campaignId);
  try {
  const [campaign] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, campaignId)).limit(1);
  if (!campaign) return;

  const effectiveTarget = opts.targetOverride ?? campaign.targetType;

  // Cálculo do range OFFSET + LIMIT a partir de dispatchFrom/dispatchTo (posições 1-based)
  const rangeOffset = opts.dispatchFrom && opts.dispatchFrom > 1 ? opts.dispatchFrom - 1 : 0;
  const rangeLimit = opts.dispatchTo ? opts.dispatchTo - (opts.dispatchFrom ?? 1) + 1 : null;
  const rangeSql = rangeLimit !== null
    ? (rangeOffset > 0 ? sql` OFFSET ${rangeOffset} LIMIT ${rangeLimit}` : sql` LIMIT ${rangeLimit}`)
    : (rangeOffset > 0 ? sql` OFFSET ${rangeOffset}` : sql``);

  let contacts: ContactRow[] = [];

  if (effectiveTarget === "manual") {
    if (!opts.manualRecipients?.length) {
      logger.error({ campaignId, effectiveTarget }, "Dispatch abortado: target=manual mas manualRecipients vazio — evitando envio para todos");
      await db.update(marketingCampaignsTable).set({ status: "draft" }).where(eq(marketingCampaignsTable.id, campaignId));
      return;
    }
    // Busca unsub_token real do banco para destinatários manuais (necessário para RFC 8058)
    const manualEmails = opts.manualRecipients.map(r => r.email.toLowerCase().trim());
    const existingContacts = manualEmails.length > 0
      ? await db.select({ email: marketingContactsTable.email, unsubToken: marketingContactsTable.unsubToken })
          .from(marketingContactsTable)
          .where(inArray(marketingContactsTable.email, manualEmails))
      : [];
    const unsubByEmail = new Map(existingContacts.map(c => [c.email, c.unsubToken]));
    contacts = opts.manualRecipients.map((r, i) => ({
      id: -(i + 1), name: r.name, email: r.email, phone: null,
      type: "manual", status: "active", bounced: false, hadBounce: false, isNew: false, tags: null,
      emailStatus: "unknown", emailInvalidReason: null, emailValidatedAt: null,
      unsubscribedAt: null,
      unsubToken: unsubByEmail.get(r.email.toLowerCase().trim()) ?? randomUUID(),
      createdAt: new Date(),
    }));
  } else if (effectiveTarget === "specific") {
    if (!opts.specificContactIds?.length) {
      logger.error({ campaignId, effectiveTarget }, "Dispatch abortado: target=specific mas specificContactIds vazio — evitando envio para todos");
      await db.update(marketingCampaignsTable).set({ status: "draft" }).where(eq(marketingCampaignsTable.id, campaignId));
      return;
    }
    contacts = await db.select().from(marketingContactsTable)
      .where(and(
        inArray(marketingContactsTable.id, opts.specificContactIds),
        eq(marketingContactsTable.status, "active"),
        eq(marketingContactsTable.bounced, false),
      ));
  } else if (effectiveTarget === "not_opened_cliente" || effectiveTarget === "not_opened_contador") {
    const contactType = effectiveTarget === "not_opened_cliente" ? "cliente" : "contador";
    const rawContacts = await db.execute<RawContactRow>(sql`
      SELECT mc.id, mc.name, mc.email, mc.phone, mc.type, mc.status, mc.bounced, mc.tags,
        mc.email_status, mc.email_invalid_reason, mc.email_validated_at,
        mc.unsubscribed_at, mc.unsub_token, mc.created_at
      FROM marketing_contacts mc
      WHERE mc.status = 'active'
        AND mc.bounced = false
        AND mc.email_status NOT IN ('invalid', 'disposable')
        AND mc.type = ${contactType}
        AND NOT EXISTS (
          SELECT 1 FROM marketing_sends ms
          WHERE ms.contact_id = mc.id AND ms.opened_at IS NOT NULL
        )
      ORDER BY mc.id ASC${rangeSql}
    `);
    contacts = rawContacts.rows.map(mapContact);
    logger.info({ campaignId, effectiveTarget, contactsFound: contacts.length, dispatchFrom: opts.dispatchFrom, dispatchTo: opts.dispatchTo }, "Dispatch contacts loaded (not-opened)");
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
        mc.unsubscribed_at, mc.unsub_token, mc.created_at
      FROM marketing_contacts mc
      INNER JOIN marketing_sends ms ON ms.contact_id = mc.id
      WHERE ms.${sql.raw(engagementCol)} IS NOT NULL
        AND mc.status = 'active'
        AND mc.bounced = false
        AND mc.email_status NOT IN ('invalid', 'disposable')
        ${typeClause}
      ORDER BY mc.id ASC${rangeSql}
    `);
    contacts = rawContacts.rows.map(mapContact);
    logger.info({ campaignId, effectiveTarget, contactsFound: contacts.length, dispatchFrom: opts.dispatchFrom, dispatchTo: opts.dispatchTo }, "Dispatch contacts loaded (engagement)");
  } else if (effectiveTarget === "new_contacts" || effectiveTarget === "new_cliente" || effectiveTarget === "new_contador") {
    const typeFilter = effectiveTarget === "new_cliente" ? "cliente" : effectiveTarget === "new_contador" ? "contador" : null;
    const rawContacts = await db.execute<RawContactRow>(
      sql`SELECT * FROM marketing_contacts WHERE is_new = true AND status = 'active' AND bounced = false AND email_status NOT IN ('invalid', 'disposable')${typeFilter ? sql` AND type = ${typeFilter}` : sql``} ORDER BY id ASC${rangeSql}`
    );
    contacts = rawContacts.rows.map(mapContact);
    logger.info({ campaignId, effectiveTarget, contactsFound: contacts.length, dispatchFrom: opts.dispatchFrom, dispatchTo: opts.dispatchTo }, "Dispatch contacts loaded (new_contacts)");
  } else {
    const typeFilter = effectiveTarget === "cliente" ? "cliente" : effectiveTarget === "contador" ? "contador" : null;
    const rawContacts = await db.execute<RawContactRow>(
      sql`SELECT * FROM marketing_contacts WHERE status = 'active' AND bounced = false AND email_status NOT IN ('invalid', 'disposable')${typeFilter ? sql` AND type = ${typeFilter}` : sql``} ORDER BY id ASC${rangeSql}`
    );
    contacts = rawContacts.rows.map(mapContact);
    logger.info({ campaignId, effectiveTarget, contactsFound: contacts.length, dispatchFrom: opts.dispatchFrom, dispatchTo: opts.dispatchTo }, "Dispatch contacts loaded");
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

  // ── Separar contatos: "outros" primeiro, depois filas fixas por provedor ────
  const buckets = {
    outros:  allRemaining.filter(c => getProviderKey(c.email) === "outros"),
    gmail:   allRemaining.filter(c => getProviderKey(c.email) === "gmail"),
    outlook: allRemaining.filter(c => getProviderKey(c.email) === "outlook"),
    yahoo:   allRemaining.filter(c => getProviderKey(c.email) === "yahoo"),
    uolbol:  allRemaining.filter(c => getProviderKey(c.email) === "uolbol"),
  };

  // ── Filtro de provedores: zera filas não autorizadas ANTES de qualquer envio ─
  if (opts.includedProviders && opts.includedProviders.length > 0) {
    const allowed = new Set(opts.includedProviders);
    const originalCounts = { outros: buckets.outros.length, gmail: buckets.gmail.length, outlook: buckets.outlook.length, yahoo: buckets.yahoo.length, uolbol: buckets.uolbol.length };
    if (!allowed.has("outros"))  buckets.outros  = [];
    if (!allowed.has("gmail"))   buckets.gmail   = [];
    if (!allowed.has("outlook")) buckets.outlook = [];
    if (!allowed.has("yahoo"))   buckets.yahoo   = [];
    if (!allowed.has("uolbol"))  buckets.uolbol  = [];
    logger.info({ campaignId, includedProviders: opts.includedProviders, originalCounts, filteredCounts: { outros: buckets.outros.length, gmail: buckets.gmail.length, outlook: buckets.outlook.length, yahoo: buckets.yahoo.length, uolbol: buckets.uolbol.length } }, "Filtro de provedores aplicado");
  }

  // Mark campaign as sending with total count
  await db.update(marketingCampaignsTable).set({
    status: "sending",
    totalContacts: contacts.length,
    totalSent: alreadySentCount,
  }).where(eq(marketingCampaignsTable.id, campaignId));

  let sent = alreadySentCount;
  let bounced = campaign.totalBounced;

  // ── Rate control para "outros": vem do modal de envio ou do que foi salvo na campanha ──
  const userBatchSize = opts.sendBatchSize ?? campaign.sendBatchSize ?? null;
  const userIntervalMs = opts.sendIntervalSecs != null
    ? opts.sendIntervalSecs * 1000
    : campaign.sendIntervalSecs != null ? campaign.sendIntervalSecs * 1000 : null;

  logger.info({
    campaignId, total: contacts.length, alreadySent: alreadySentCount,
    outros: buckets.outros.length, gmail: buckets.gmail.length,
    outlook: buckets.outlook.length, yahoo: buckets.yahoo.length,
    uolbol: buckets.uolbol.length, userBatchSize, userIntervalMs,
  }, "Campaign dispatch started");

  async function sendOne(contact: ContactRow): Promise<void> {
    if (contact.id > 0) {
      // Guard para contatos da base: verifica status atualizado antes de enviar
      const [fresh] = await db
        .select({ status: marketingContactsTable.status, bounced: marketingContactsTable.bounced, unsubscribedAt: marketingContactsTable.unsubscribedAt })
        .from(marketingContactsTable)
        .where(eq(marketingContactsTable.id, contact.id))
        .limit(1);
      if (!fresh || fresh.status !== "active" || fresh.bounced || fresh.unsubscribedAt) {
        logger.info({ contactId: contact.id, email: contact.email, status: fresh?.status }, "Contato descadastrado/inativo — pulando envio");
        return;
      }
    } else {
      // Guard para destinatários manuais: verifica se o email está descadastrado na base
      const [existing] = await db
        .select({ status: marketingContactsTable.status, unsubscribedAt: marketingContactsTable.unsubscribedAt })
        .from(marketingContactsTable)
        .where(eq(marketingContactsTable.email, contact.email.toLowerCase()))
        .limit(1);
      if (existing && (existing.status === "unsubscribed" || existing.unsubscribedAt)) {
        logger.info({ email: contact.email }, "Destinatário manual descadastrado na base — pulando envio");
        return;
      }
    }

    // ── Validação de e-mail antes do envio ────────────────────────────────────
    // Para contatos com email_status = 'unknown', valida antes de enviar.
    // Usa ZeroBounce se configurado, senão SMTP + MX. Resultados ficam em cache
    // por 7 dias, então a validação só ocorre uma vez por endereço.
    if (contact.emailStatus === "unknown" || !contact.emailStatus) {
      const validity = await validateEmail(contact.email);
      const reason: string | null = validity === "disposable" ? "disposable_domain" : validity === "invalid" ? "smtp_invalid" : null;
      if (contact.id > 0) {
        await db.update(marketingContactsTable)
          .set({ emailStatus: validity, emailInvalidReason: reason, emailValidatedAt: new Date() })
          .where(eq(marketingContactsTable.id, contact.id));
      }
      if (validity === "invalid" || validity === "disposable") {
        logger.info({ contactId: contact.id, email: contact.email, validity }, "E-mail inválido detectado antes do envio — pulando");
        return;
      }
    }

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
      if ((effectiveTarget === "new_contacts" || effectiveTarget === "new_cliente" || effectiveTarget === "new_contador") && contact.id > 0) {
        await db.update(marketingContactsTable).set({ isNew: false }).where(eq(marketingContactsTable.id, contact.id));
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await db.update(marketingSendsTable).set({ status: "failed", error }).where(eq(marketingSendsTable.trackingToken, token));
      bounced++;
      logger.warn({ email: contact.email, error }, "Failed to send marketing email");
      if (contact.id > 0) {
        const isPermanentBounce = /\b55[0-4]\b|user.unknown|does not exist|no such user|mailbox.*not.*found|invalid (address|recipient|mailbox|user)|user.*invalid|address.*invalid|recipient.*invalid|account.*does.*not.*exist|no.*mailbox|mailbox.*unavailable|permanently.*failed|address.*rejected/i.test(error);
        if (isPermanentBounce) {
          await db.update(marketingContactsTable).set({ bounced: true, hadBounce: true }).where(eq(marketingContactsTable.id, contact.id));
          logger.info({ contactId: contact.id, email: contact.email }, "Contato marcado como bloqueado por bounce permanente");
        }
      }
    }
  }

  // ── Horário comercial: auto-pausa quando fora do horário configurado ────────
  async function checkAndWaitBusinessHours(): Promise<boolean> {
    const sh = opts.sendStartHour ?? campaign.sendStartHour ?? null;
    const eh = opts.sendEndHour ?? campaign.sendEndHour ?? null;
    const days = opts.sendDays ?? campaign.sendDays ?? null;
    if (sh == null || eh == null) return true; // sem restrição
    if (isWithinBusinessHours(sh, eh, days ?? undefined)) return true; // dentro do horário
    // Fora do horário — auto-pausa
    if (!pausedCampaigns.has(campaignId)) {
      pausedCampaigns.add(campaignId);
      await db.update(marketingCampaignsTable).set({ status: "paused" }).where(eq(marketingCampaignsTable.id, campaignId));
      logger.info({ campaignId, startHour: sh, endHour: eh }, "Fora do horário comercial — campanha pausada automaticamente");
    }
    return true; // cai no waitIfPaused abaixo
  }

  // ── Pausa: aguarda enquanto a campanha estiver no Set pausedCampaigns ─────
  async function waitIfPaused(): Promise<boolean> {
    await checkAndWaitBusinessHours();
    if (!pausedCampaigns.has(campaignId)) return true; // not paused, continue
    logger.info({ campaignId }, "Campanha pausada — aguardando retomada");
    while (pausedCampaigns.has(campaignId)) {
      await new Promise(r => setTimeout(r, 2_000));
      // Check if cancelled (status reverted to draft while waiting)
      const [check] = await db.select({ status: marketingCampaignsTable.status })
        .from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, campaignId)).limit(1);
      if (!check || check.status === "draft" || check.status === "cancelled") {
        logger.info({ campaignId }, "Campanha cancelada durante pausa — abortando dispatch");
        return false; // signal to stop
      }
    }
    logger.info({ campaignId }, "Campanha retomada — continuando envio");
    return true;
  }

  // ── Helper: envia uma fila com lote fixo e pausa ─────────────────────────
  async function sendProviderQueue(queue: ContactRow[], providerName: string, batchSize: number, pauseMs: number): Promise<void> {
    if (!queue.length) return;
    logger.info({ campaignId, provider: providerName, total: queue.length, batchSize, pauseSecs: pauseMs / 1000 }, "Iniciando fila de provedor");
    let sentInBatch = 0;
    for (let i = 0; i < queue.length; i++) {
      if (!await waitIfPaused()) return;
      await sendOne(queue[i]);
      sentInBatch++;
      const isLast = i === queue.length - 1;
      if (sentInBatch >= batchSize && !isLast) {
        logger.info({ campaignId, provider: providerName, sentInBatch, pauseSecs: pauseMs / 1000 }, "Lote completo — aguardando pausa");
        await new Promise(r => setTimeout(r, pauseMs));
        sentInBatch = 0;
      }
    }
    logger.info({ campaignId, provider: providerName, total: queue.length }, "Fila de provedor concluída");
  }

  // ── 1. Outros (config do painel) ─────────────────────────────────────────
  let normalSentInBatch = 0;
  for (let i = 0; i < buckets.outros.length; i++) {
    if (!await waitIfPaused()) {
      await db.update(marketingCampaignsTable).set({ status: "sent", sentAt: new Date(), totalSent: sent, totalDelivered: sent, totalBounced: bounced }).where(eq(marketingCampaignsTable.id, campaignId));
      return;
    }
    await sendOne(buckets.outros[i]);
    normalSentInBatch++;
    await new Promise(r => setTimeout(r, 100));
    const isLast = i === buckets.outros.length - 1;
    if (userBatchSize && userIntervalMs && normalSentInBatch >= userBatchSize && !isLast) {
      logger.info({ campaignId, normalSentInBatch, waitSecs: userIntervalMs / 1000 }, "Outros: lote completo — aguardando intervalo");
      await new Promise(r => setTimeout(r, userIntervalMs));
      normalSentInBatch = 0;
    }
  }

  // ── 2. Gmail: lotes de 1.000 · pausa 2 min ───────────────────────────────
  await sendProviderQueue(buckets.gmail, "Gmail", PROVIDER_QUEUES.gmail.batchSize, PROVIDER_QUEUES.gmail.pauseMs);

  // ── 3. Outlook / Hotmail / Live / MSN: lotes de 1.500 · pausa 2 min ──────
  await sendProviderQueue(buckets.outlook, "Outlook", PROVIDER_QUEUES.outlook.batchSize, PROVIDER_QUEUES.outlook.pauseMs);

  // ── 4. Yahoo: lotes de 1.000 · pausa 1 min ───────────────────────────────
  await sendProviderQueue(buckets.yahoo, "Yahoo", PROVIDER_QUEUES.yahoo.batchSize, PROVIDER_QUEUES.yahoo.pauseMs);

  // ── 5. UOL / BOL: lotes de 2.000 · pausa 1 min ───────────────────────────
  await sendProviderQueue(buckets.uolbol, "UOL/BOL", PROVIDER_QUEUES.uolbol.batchSize, PROVIDER_QUEUES.uolbol.pauseMs);

  await db.update(marketingCampaignsTable).set({
    status: "sent", sentAt: new Date(), totalSent: sent, totalDelivered: sent, totalBounced: bounced,
  }).where(eq(marketingCampaignsTable.id, campaignId));

  logger.info({ campaignId, sent, bounced }, "Campaign dispatch complete");
  } finally {
    activeDispatches.delete(campaignId);
    pausedCampaigns.delete(campaignId); // clean up any stale pause signal
  }
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
