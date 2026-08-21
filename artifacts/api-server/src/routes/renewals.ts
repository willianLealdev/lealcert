import { Router } from "express";
import { eq, lt, and, desc } from "drizzle-orm";
import { db, certificateRenewalsTable, ordersTable, settingsTable, usersTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { sendRenewalAlertEmail } from "../lib/email";

const router = Router();

async function renewalOwnerId(req: Express.Request): Promise<number | null> {
  const sessionUserId = req.session.userId;
  const sessionRole = req.session.role;

  if (!sessionUserId) return -1;
  if (sessionRole === "admin" || req.session.userType === "admin") return null;
  if (sessionRole !== "contador" && sessionRole !== "operador") return -1;

  const [user] = await db
    .select({
      id: usersTable.id,
      role: usersTable.role,
      userType: usersTable.userType,
      contadorId: usersTable.contadorId,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(eq(usersTable.id, sessionUserId))
    .limit(1);

  if (!user || !user.isActive) return -1;
  if (user.role === "contador" && user.userType === "contador") return user.id;
  if (user.role !== "operador" || !user.contadorId) return -1;

  const [contador] = await db
    .select({ id: usersTable.id, role: usersTable.role, userType: usersTable.userType, isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.id, user.contadorId))
    .limit(1);

  return contador?.isActive && contador.role === "contador" && contador.userType === "contador"
    ? contador.id
    : -1;
}

// ── GET /renewals — listar renovação do administrador ou do escritório logado ─
router.get("/renewals", requireAuth, async (req, res): Promise<void> => {
  try {
    const ownerId = await renewalOwnerId(req);
    if (ownerId === -1) {
      res.status(403).json({ error: "Acesso negado." });
      return;
    }

    const renewals = ownerId === null
      ? await db
        .select()
        .from(certificateRenewalsTable)
        .orderBy(desc(certificateRenewalsTable.expiresAt))
      : (await db
        .select({ renewal: certificateRenewalsTable })
        .from(certificateRenewalsTable)
        .innerJoin(ordersTable, eq(certificateRenewalsTable.orderId, ordersTable.id))
        .where(eq(ordersTable.userId, ownerId))
        .orderBy(desc(certificateRenewalsTable.expiresAt)))
        .map(({ renewal }) => renewal);

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
