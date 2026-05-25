import { Router } from "express";
import { eq, lt, and, desc } from "drizzle-orm";
import { db, certificateRenewalsTable, settingsTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { sendRenewalAlertEmail } from "../lib/email";

const router = Router();

// ── GET /renewals — listar todos os registros de renovação ────────────────────
router.get("/renewals", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  try {
    const renewals = await db
      .select()
      .from(certificateRenewalsTable)
      .orderBy(desc(certificateRenewalsTable.expiresAt));
    res.json(renewals);
  } catch (err) {
    logger.error({ err }, "renewals: erro ao listar");
    res.status(500).json({ error: "Erro ao listar renovações." });
  }
});

// ── POST /renewals/check-alerts — verifica vencimentos e envia e-mails ───────
// Pode ser chamado manualmente pelo admin ou por um scheduler externo
router.post("/renewals/check-alerts", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    const siteUrl = settings?.siteUrl ?? undefined;

    const now = new Date();

    // Buscar todos os registros com e-mail cadastrado que ainda não venceram
    const renewals = await db
      .select()
      .from(certificateRenewalsTable)
      .where(lt(certificateRenewalsTable.expiresAt, new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000)));

    let sent = 0;
    const results: { id: number; customer: string; daysLeft: number; sent: boolean }[] = [];

    for (const r of renewals) {
      if (!r.customerEmail) continue;
      const daysLeft = Math.ceil((r.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft < 0) continue; // já vencido, não enviar

      let shouldSend = false;
      const updates: Partial<typeof r> = {};

      if (daysLeft <= 1 && !r.alertSent1d) {
        shouldSend = true;
        updates.alertSent1d = true;
      } else if (daysLeft <= 7 && !r.alertSent7d) {
        shouldSend = true;
        updates.alertSent7d = true;
      } else if (daysLeft <= 30 && !r.alertSent30d) {
        shouldSend = true;
        updates.alertSent30d = true;
      }

      if (shouldSend) {
        try {
          await sendRenewalAlertEmail({
            to: r.customerEmail,
            customerName: r.customerName,
            certificateName: r.certificateName,
            protocolo: r.garProtocolo ?? undefined,
            expiresAt: r.expiresAt,
            daysLeft,
            siteUrl,
          });
          await db.update(certificateRenewalsTable).set(updates).where(eq(certificateRenewalsTable.id, r.id));
          sent++;
          results.push({ id: r.id, customer: r.customerName, daysLeft, sent: true });
        } catch (emailErr) {
          logger.error({ err: emailErr, renewalId: r.id }, "Erro ao enviar alerta de renovação");
          results.push({ id: r.id, customer: r.customerName, daysLeft, sent: false });
        }
      }
    }

    logger.info({ sent, total: renewals.length }, "renewals: check-alerts concluído");
    res.json({ ok: true, processed: renewals.length, sent, results });
  } catch (err) {
    logger.error({ err }, "renewals: erro ao verificar alertas");
    res.status(500).json({ error: "Erro ao verificar alertas de renovação." });
  }
});

// ── POST /renewals/:id/send-alert — enviar alerta manualmente para um registro
router.post("/renewals/:id/send-alert", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [settings] = await db.select().from(settingsTable).limit(1);

  const [renewal] = await db.select().from(certificateRenewalsTable).where(eq(certificateRenewalsTable.id, id)).limit(1);
  if (!renewal) { res.status(404).json({ error: "Registro não encontrado." }); return; }
  if (!renewal.customerEmail) { res.status(400).json({ error: "Este cliente não possui e-mail cadastrado." }); return; }

  const now = new Date();
  const daysLeft = Math.ceil((renewal.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  try {
    await sendRenewalAlertEmail({
      to: renewal.customerEmail,
      customerName: renewal.customerName,
      certificateName: renewal.certificateName,
      protocolo: renewal.garProtocolo ?? undefined,
      expiresAt: renewal.expiresAt,
      daysLeft: Math.max(daysLeft, 0),
      siteUrl: settings?.siteUrl ?? undefined,
    });
    res.json({ ok: true, daysLeft });
  } catch (err) {
    logger.error({ err, renewalId: id }, "Erro ao enviar alerta manual");
    res.status(500).json({ error: "Erro ao enviar e-mail de alerta." });
  }
});

export default router;
