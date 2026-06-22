import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, ticketsTable, messagesTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { sendPushToAdmins } from "../lib/push";
import { logger } from "../lib/logger";

const router = Router();

router.get("/support", requireAuth, async (req, res): Promise<void> => {
  const session = req.session;
  const userId = session.userId as number;
  const role = session.role as string;

  const rows = await db
    .select({ ticket: ticketsTable, userName: usersTable.name })
    .from(ticketsTable)
    .leftJoin(usersTable, eq(ticketsTable.userId, usersTable.id))
    .orderBy(desc(ticketsTable.updatedAt));

  const filtered = role === "admin" ? rows : rows.filter(r => r.ticket.userId === userId);

  res.json(filtered.map(r => ({
    id: r.ticket.id,
    userId: r.ticket.userId,
    userName: r.userName ?? null,
    subject: r.ticket.subject,
    status: r.ticket.status,
    unreadAdmin: r.ticket.unreadAdmin,
    unreadClient: r.ticket.unreadClient,
    createdAt: r.ticket.createdAt,
    updatedAt: r.ticket.updatedAt,
  })));
});

router.post("/support", requireAuth, async (req, res): Promise<void> => {
  const session = req.session;
  const userId = session.userId as number;
  const { subject, message } = req.body ?? {};
  if (!subject || !message) {
    res.status(400).json({ error: "Assunto e mensagem são obrigatórios." });
    return;
  }
  const [ticket] = await db.insert(ticketsTable).values({ userId, subject }).returning();
  await db.insert(messagesTable).values({ ticketId: ticket.id, userId, content: message });

  // Push para todos os admins
  const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  sendPushToAdmins({
    title: "🎫 Novo chamado de suporte",
    body: `${user?.name ?? "Cliente"}: ${subject}`,
    tag: `ticket-${ticket.id}`,
    url: `/admin/support/${ticket.id}`,
  }).catch((err: unknown) => logger.error({ err }, "support: erro ao enviar push aos admins"));

  res.status(201).json({
    id: ticket.id,
    userId: ticket.userId,
    userName: null,
    subject: ticket.subject,
    status: ticket.status,
    unreadAdmin: ticket.unreadAdmin,
    unreadClient: ticket.unreadClient,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  });
});

router.get("/support/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const session = req.session;
  const userId = session.userId as number;
  const role = session.role as string;

  const [row] = await db
    .select({ ticket: ticketsTable, userName: usersTable.name })
    .from(ticketsTable)
    .leftJoin(usersTable, eq(ticketsTable.userId, usersTable.id))
    .where(eq(ticketsTable.id, id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Ticket não encontrado." });
    return;
  }
  if (role !== "admin" && row.ticket.userId !== userId) {
    res.status(403).json({ error: "Acesso negado." });
    return;
  }

  // mark as read
  if (role === "admin") {
    await db.update(ticketsTable).set({ unreadAdmin: false }).where(eq(ticketsTable.id, id));
  } else {
    await db.update(ticketsTable).set({ unreadClient: false }).where(eq(ticketsTable.id, id));
  }

  const msgs = await db
    .select({ msg: messagesTable, userName: usersTable.name, userRole: usersTable.role })
    .from(messagesTable)
    .leftJoin(usersTable, eq(messagesTable.userId, usersTable.id))
    .where(eq(messagesTable.ticketId, id))
    .orderBy(messagesTable.createdAt);

  res.json({
    id: row.ticket.id,
    userId: row.ticket.userId,
    userName: row.userName ?? null,
    subject: row.ticket.subject,
    status: row.ticket.status,
    messages: msgs.map(m => ({
      id: m.msg.id,
      ticketId: m.msg.ticketId,
      userId: m.msg.userId,
      userName: m.userName ?? null,
      userRole: m.userRole ?? null,
      content: m.msg.content,
      createdAt: m.msg.createdAt,
    })),
    createdAt: row.ticket.createdAt,
  });
});

router.post("/support/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const session = req.session;
  const userId = session.userId as number;
  const role = session.role as string;
  const { content } = req.body ?? {};
  if (!content) {
    res.status(400).json({ error: "Mensagem não pode ser vazia." });
    return;
  }

  const [msg] = await db.insert(messagesTable).values({ ticketId: id, userId, content }).returning();

  // mark unread for the other side
  if (role === "admin") {
    await db.update(ticketsTable).set({ unreadClient: true, status: "in_progress", updatedAt: new Date() }).where(eq(ticketsTable.id, id));
  } else {
    await db.update(ticketsTable).set({ unreadAdmin: true, updatedAt: new Date() }).where(eq(ticketsTable.id, id));
  }

  const [user] = await db.select({ name: usersTable.name, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  res.status(201).json({
    id: msg.id,
    ticketId: msg.ticketId,
    userId: msg.userId,
    userName: user?.name ?? null,
    userRole: user?.role ?? null,
    content: msg.content,
    createdAt: msg.createdAt,
  });
});

router.patch("/support/:id/close", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [ticket] = await db
    .update(ticketsTable)
    .set({ status: "closed", updatedAt: new Date() })
    .where(eq(ticketsTable.id, id))
    .returning();
  if (!ticket) {
    res.status(404).json({ error: "Ticket não encontrado." });
    return;
  }
  res.json({
    id: ticket.id,
    userId: ticket.userId,
    userName: null,
    subject: ticket.subject,
    status: ticket.status,
    unreadAdmin: ticket.unreadAdmin,
    unreadClient: ticket.unreadClient,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  });
});

export default router;
