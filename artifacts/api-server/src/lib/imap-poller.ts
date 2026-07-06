import imaps from "imap-simple";
import { simpleParser } from "mailparser";
import { db, settingsTable } from "@workspace/db";
import { logger } from "./logger";

let pollerRunning = false;

async function pollInbox(): Promise<void> {
  if (pollerRunning) return;
  pollerRunning = true;
  try {
    const [s] = await db.select({
      smtpHostDb: settingsTable.smtpHostDb,
      smtpUserDb: settingsTable.smtpUserDb,
      smtpPassDb: settingsTable.smtpPassDb,
      webhookSecret: settingsTable.webhookSecret,
    }).from(settingsTable).limit(1);

    const host = s?.smtpHostDb ?? process.env.SMTP_HOST;
    const user = s?.smtpUserDb ?? process.env.SMTP_USER;
    const pass = s?.smtpPassDb ?? process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      logger.warn("IMAP poller: credenciais não configuradas, pulando");
      return;
    }

    const connection = await imaps.connect({
      imap: {
        user,
        password: pass,
        host,
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10_000,
      },
    });

    await connection.openBox("INBOX");

    const messages = await connection.search(["UNSEEN"], {
      bodies: [""],
      markSeen: true,
    });

    logger.info({ count: messages.length }, "IMAP poller: emails não lidos encontrados");

    for (const message of messages) {
      try {
        const part = message.parts.find((p: { which: string }) => p.which === "");
        if (!part) continue;
        const parsed = await simpleParser(part.body as string);

        const fromRaw = parsed.from?.text ?? "";
        const subject = parsed.subject ?? "";
        const text = parsed.text ?? null;
        const html = parsed.html || null;
        const messageId = parsed.messageId ?? null;
        const inReplyTo = parsed.inReplyTo ?? null;

        const port = process.env.PORT ?? "8080";
        const secret = s?.webhookSecret ?? "";
        const url = `http://localhost:${port}/api/marketing/webhook/inbound${secret ? `?secret=${encodeURIComponent(secret)}` : ""}`;

        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: fromRaw, subject, text, html, messageId, inReplyTo }),
        });

        if (resp.ok) {
          logger.info({ from: fromRaw, subject }, "IMAP poller: reply processada");
        } else {
          logger.warn({ from: fromRaw, status: resp.status }, "IMAP poller: webhook retornou erro");
        }
      } catch (err) {
        logger.error({ err }, "IMAP poller: erro ao processar mensagem");
      }
    }

    connection.end();
  } catch (err) {
    logger.error({ err }, "IMAP poller: erro na conexão");
  } finally {
    pollerRunning = false;
  }
}

export function startImapPoller(): void {
  const INTERVAL_MS = 2 * 60_000;
  setTimeout(() => pollInbox().catch(err => logger.error({ err }, "IMAP poller: erro inicial")), 20_000);
  setInterval(() => pollInbox().catch(err => logger.error({ err }, "IMAP poller: erro no intervalo")), INTERVAL_MS);
  logger.info("IMAP reply poller started (2min interval)");
}
