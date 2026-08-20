import { Router } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { createHmac, randomBytes } from "crypto";
import { db, meetingParticipantsTable, meetingsTable, settingsTable, usersTable } from "@workspace/db";
import { requireVendedor } from "../middlewares/auth";
import { sendMeetingInvitationEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router = Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ParticipantInput = { name?: unknown; email?: unknown };
type MeetingInput = {
  title?: unknown;
  description?: unknown;
  scheduledAt?: unknown;
  durationMinutes?: unknown;
  participants?: unknown;
};

function isAdmin(req: { session: { role?: unknown; userType?: unknown } }) {
  return req.session.role === "admin" || req.session.userType === "admin";
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function normalizeDomain(value?: string | null) {
  return (value || "meet.lealcert.com.br")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function validateParticipants(value: unknown): { participants?: { name: string; email: string }[]; error?: string } {
  if (value === undefined) return {};
  if (!Array.isArray(value) || value.length > 100) return { error: "Informe até 100 participantes." };
  const emails = new Set<string>();
  const participants: { name: string; email: string }[] = [];
  for (const raw of value as ParticipantInput[]) {
    const name = typeof raw?.name === "string" ? raw.name.trim() : "";
    const email = typeof raw?.email === "string" ? raw.email.trim().toLowerCase() : "";
    if (!name || !EMAIL.test(email)) return { error: "Todos os participantes precisam ter nome e e-mail válidos." };
    if (emails.has(email)) return { error: "Não repita o mesmo e-mail entre os participantes." };
    emails.add(email);
    participants.push({ name, email });
  }
  return { participants };
}

function parseInput(body: unknown, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Envie os dados da reunião em formato JSON." };
  const input = body as MeetingInput;
  const parsed: Record<string, unknown> = {};
  if (!partial || input.title !== undefined) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title || title.length > 160) return { error: "Informe um título de até 160 caracteres." };
    parsed.title = title;
  }
  if (!partial || input.scheduledAt !== undefined) {
    const scheduledAt = new Date(String(input.scheduledAt ?? ""));
    if (Number.isNaN(scheduledAt.getTime())) return { error: "Informe uma data e horário válidos." };
    parsed.scheduledAt = scheduledAt;
  }
  if (input.description !== undefined) {
    parsed.description = typeof input.description === "string" ? input.description.trim().slice(0, 2000) || null : null;
  } else if (!partial) {
    parsed.description = null;
  }
  if (!partial || input.durationMinutes !== undefined) {
    const durationMinutes = Number(input.durationMinutes ?? 30);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
      return { error: "A duração deve estar entre 5 e 480 minutos." };
    }
    parsed.durationMinutes = durationMinutes;
  }
  const participantResult = validateParticipants(input.participants);
  if (participantResult.error) return participantResult;
  if (participantResult.participants !== undefined) parsed.participants = participantResult.participants;
  return { data: parsed as {
    title?: string; description?: string | null; scheduledAt?: Date; durationMinutes?: number;
    participants?: { name: string; email: string }[];
  } };
}

function parseMeetingId(value: string | string[]) {
  if (typeof value !== "string") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function getJitsiConfig() {
  const [settings] = await db.select({
    jitsiAppId: settingsTable.jitsiAppId,
    jitsiAppSecret: settingsTable.jitsiAppSecret,
    jitsiDomain: settingsTable.jitsiDomain,
  }).from(settingsTable).limit(1);
  return {
    appId: settings?.jitsiAppId?.trim() || null,
    appSecret: settings?.jitsiAppSecret || null,
    domain: normalizeDomain(settings?.jitsiDomain),
  };
}

function createJoinUrl(opts: {
  domain: string; appId: string | null; appSecret: string | null; roomSlug: string;
  userId: number; userName: string; email?: string; moderator: boolean; expiresAt: Date;
}) {
  const url = new URL(`https://${opts.domain}/${opts.roomSlug}`);
  if (!opts.appId || !opts.appSecret) return url.toString();
  const now = Math.floor(Date.now() / 1000);
  const token = [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({
      aud: opts.appId,
      iss: opts.appId,
      sub: opts.domain,
      room: opts.roomSlug,
      iat: now,
      nbf: now - 30,
      exp: Math.max(now + 3600, Math.floor(opts.expiresAt.getTime() / 1000)),
      context: { user: { id: String(opts.userId), name: opts.userName, email: opts.email ?? "", moderator: opts.moderator } },
    }),
  ];
  token.push(createHmac("sha256", opts.appSecret).update(token.join(".")).digest("base64url"));
  url.searchParams.set("jwt", token.join("."));
  return url.toString();
}

function responseStatus(meeting: typeof meetingsTable.$inferSelect) {
  if (meeting.status === "cancelled") return "cancelled";
  const endsAt = new Date(meeting.scheduledAt.getTime() + meeting.durationMinutes * 60_000);
  return endsAt < new Date() ? "completed" : meeting.status;
}

async function getMeetingRecord(id: number) {
  const [meeting] = await db.select({
    id: meetingsTable.id, title: meetingsTable.title, description: meetingsTable.description,
    scheduledAt: meetingsTable.scheduledAt, durationMinutes: meetingsTable.durationMinutes,
    status: meetingsTable.status, roomSlug: meetingsTable.roomSlug, meetingUrl: meetingsTable.meetingUrl,
    organizerUserId: meetingsTable.organizerUserId, organizerName: usersTable.name,
    cancelledAt: meetingsTable.cancelledAt, createdAt: meetingsTable.createdAt, updatedAt: meetingsTable.updatedAt,
  }).from(meetingsTable).innerJoin(usersTable, eq(usersTable.id, meetingsTable.organizerUserId))
    .where(eq(meetingsTable.id, id)).limit(1);
  if (!meeting) return null;
  const participants = await db.select({
    id: meetingParticipantsTable.id, name: meetingParticipantsTable.name, email: meetingParticipantsTable.email,
    invitationStatus: meetingParticipantsTable.invitationStatus, lastInvitedAt: meetingParticipantsTable.lastInvitedAt,
    createdAt: meetingParticipantsTable.createdAt,
  }).from(meetingParticipantsTable).where(eq(meetingParticipantsTable.meetingId, id));
  return { ...meeting, participants };
}

async function responseMeeting(record: NonNullable<Awaited<ReturnType<typeof getMeetingRecord>>>, req: { session: { userId?: number } }) {
  const jitsi = await getJitsiConfig();
  const actorId = req.session.userId as number;
  const [actor] = await db.select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, actorId)).limit(1);
  const expiresAt = new Date(Math.max(
    Date.now() + 8 * 60 * 60 * 1000,
    record.scheduledAt.getTime() + (record.durationMinutes + 12 * 60) * 60_000,
  ));
  return {
    ...record,
    status: responseStatus(record),
    joinUrl: createJoinUrl({
      ...jitsi, roomSlug: record.roomSlug, userId: actorId, userName: actor?.name ?? "Organizador",
      email: actor?.email ?? undefined, moderator: true, expiresAt,
    }),
  };
}

async function sendInvitations(record: NonNullable<Awaited<ReturnType<typeof getMeetingRecord>>>, isUpdate: boolean) {
  const jitsi = await getJitsiConfig();
  const expiresAt = new Date(Math.max(
    Date.now() + 8 * 60 * 60 * 1000,
    record.scheduledAt.getTime() + (record.durationMinutes + 12 * 60) * 60_000,
  ));
  await Promise.all(record.participants.map(async (participant) => {
    try {
      const sent = await sendMeetingInvitationEmail({
        to: participant.email, participantName: participant.name, meetingTitle: record.title,
        description: record.description, scheduledAt: record.scheduledAt, durationMinutes: record.durationMinutes,
        meetingUrl: createJoinUrl({
          ...jitsi, roomSlug: record.roomSlug, userId: participant.id, userName: participant.name,
          email: participant.email, moderator: false, expiresAt,
        }),
        isUpdate,
      });
      await db.update(meetingParticipantsTable).set({
        invitationStatus: sent ? "sent" : "pending",
        lastInvitedAt: sent ? new Date() : null,
        invitationError: null,
      }).where(eq(meetingParticipantsTable.id, participant.id));
    } catch (error) {
      logger.error({ error, participantId: participant.id }, "Failed to send meeting invitation");
      await db.update(meetingParticipantsTable).set({
        invitationStatus: "failed",
        invitationError: error instanceof Error ? error.message.slice(0, 500) : "Falha ao enviar convite.",
      }).where(eq(meetingParticipantsTable.id, participant.id));
    }
  }));
}

function canManage(record: { organizerUserId: number }, req: { session: { userId?: number; role?: unknown; userType?: unknown } }) {
  return isAdmin(req) || record.organizerUserId === req.session.userId;
}

// GET /meetings — administradores enxergam todas; vendedores apenas as próprias.
router.get("/meetings", requireVendedor, async (req, res): Promise<void> => {
  const conditions = [];
  if (!isAdmin(req)) conditions.push(eq(meetingsTable.organizerUserId, req.session.userId as number));
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
  const status = typeof req.query.status === "string" ? req.query.status : null;
  if (from && !Number.isNaN(from.getTime())) conditions.push(gte(meetingsTable.scheduledAt, from));
  if (to && !Number.isNaN(to.getTime())) conditions.push(lte(meetingsTable.scheduledAt, to));
  if (status && ["scheduled", "in_progress", "cancelled"].includes(status)) conditions.push(eq(meetingsTable.status, status));
  const rows = await db.select({ id: meetingsTable.id }).from(meetingsTable)
    .where(conditions.length ? and(...conditions) : undefined).orderBy(desc(meetingsTable.scheduledAt));
  const records = await Promise.all(rows.map(row => getMeetingRecord(row.id)));
  res.json(await Promise.all(records.filter((record): record is NonNullable<typeof record> => Boolean(record)).map(record => responseMeeting(record, req))));
});

router.post("/meetings", requireVendedor, async (req, res): Promise<void> => {
  const parsed = parseInput(req.body as MeetingInput);
  if (!("data" in parsed)) { res.status(400).json({ error: parsed.error ?? "Dados inválidos." }); return; }
  const input = parsed.data;
  const jitsi = await getJitsiConfig();
  const roomSlug = `lealcert-${randomBytes(9).toString("hex")}`;
  const [created] = await db.insert(meetingsTable).values({
    title: input.title!, description: input.description ?? null, scheduledAt: input.scheduledAt!,
    durationMinutes: input.durationMinutes!, roomSlug, meetingUrl: `https://${jitsi.domain}/${roomSlug}`,
    organizerUserId: req.session.userId as number,
  }).returning({ id: meetingsTable.id });
  if (input.participants?.length) {
    await db.insert(meetingParticipantsTable).values(input.participants.map((participant: { name: string; email: string }) => ({ meetingId: created.id, ...participant })));
  }
  const record = await getMeetingRecord(created.id);
  if (!record) { res.status(500).json({ error: "Não foi possível carregar a reunião criada." }); return; }
  await sendInvitations(record, false);
  res.status(201).json(await responseMeeting((await getMeetingRecord(created.id))!, req));
});

router.get("/meetings/:id", requireVendedor, async (req, res): Promise<void> => {
  const id = parseMeetingId(req.params.id);
  if (id === null) { res.status(400).json({ error: "ID de reunião inválido." }); return; }
  const record = await getMeetingRecord(id);
  if (!record) { res.status(404).json({ error: "Reunião não encontrada." }); return; }
  if (!canManage(record, req)) { res.status(403).json({ error: "Você não tem acesso a esta reunião." }); return; }
  res.json(await responseMeeting(record, req));
});

router.patch("/meetings/:id", requireVendedor, async (req, res): Promise<void> => {
  const id = parseMeetingId(req.params.id);
  if (id === null) { res.status(400).json({ error: "ID de reunião inválido." }); return; }
  const record = await getMeetingRecord(id);
  if (!record) { res.status(404).json({ error: "Reunião não encontrada." }); return; }
  if (!canManage(record, req)) { res.status(403).json({ error: "Você não tem acesso a esta reunião." }); return; }
  if (["cancelled", "completed"].includes(responseStatus(record))) {
    res.status(409).json({ error: "Reuniões canceladas ou concluídas não podem ser alteradas." }); return;
  }
  const parsed = parseInput(req.body as MeetingInput, { partial: true });
  if (!("data" in parsed)) { res.status(400).json({ error: parsed.error ?? "Dados inválidos." }); return; }
  const { participants, ...meetingUpdate } = parsed.data;
  if (Object.keys(meetingUpdate).length) {
    await db.update(meetingsTable).set(meetingUpdate).where(eq(meetingsTable.id, record.id));
  }
  if (participants !== undefined) {
    await db.delete(meetingParticipantsTable).where(eq(meetingParticipantsTable.meetingId, record.id));
    if (participants.length) await db.insert(meetingParticipantsTable).values(participants.map((participant: { name: string; email: string }) => ({ meetingId: record.id, ...participant })));
  }
  const updated = await getMeetingRecord(record.id);
  if (!updated) { res.status(500).json({ error: "Não foi possível atualizar a reunião." }); return; }
  if (participants !== undefined || Object.keys(meetingUpdate).length) await sendInvitations(updated, true);
  res.json(await responseMeeting((await getMeetingRecord(record.id))!, req));
});

router.post("/meetings/:id/cancel", requireVendedor, async (req, res): Promise<void> => {
  const id = parseMeetingId(req.params.id);
  if (id === null) { res.status(400).json({ error: "ID de reunião inválido." }); return; }
  const record = await getMeetingRecord(id);
  if (!record) { res.status(404).json({ error: "Reunião não encontrada." }); return; }
  if (!canManage(record, req)) { res.status(403).json({ error: "Você não tem acesso a esta reunião." }); return; }
  if (responseStatus(record) === "completed") {
    res.status(409).json({ error: "Uma reunião concluída não pode ser cancelada." }); return;
  }
  if (record.status === "cancelled") { res.json(await responseMeeting(record, req)); return; }
  await db.update(meetingsTable).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(meetingsTable.id, record.id));
  res.json(await responseMeeting((await getMeetingRecord(record.id))!, req));
});

router.post("/meetings/:id/start", requireVendedor, async (req, res): Promise<void> => {
  const id = parseMeetingId(req.params.id);
  if (id === null) { res.status(400).json({ error: "ID de reunião inválido." }); return; }
  const record = await getMeetingRecord(id);
  if (!record) { res.status(404).json({ error: "Reunião não encontrada." }); return; }
  if (!canManage(record, req)) { res.status(403).json({ error: "Você não tem acesso a esta reunião." }); return; }
  if (!["scheduled", "in_progress"].includes(responseStatus(record))) {
    res.status(409).json({ error: "Apenas reuniões agendadas podem ser iniciadas." }); return;
  }
  if (record.status === "scheduled") await db.update(meetingsTable).set({ status: "in_progress" }).where(eq(meetingsTable.id, record.id));
  res.json(await responseMeeting((await getMeetingRecord(record.id))!, req));
});

router.delete("/meetings/:id", requireVendedor, async (req, res): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Apenas administradores podem excluir reuniões." }); return; }
  const id = parseMeetingId(req.params.id);
  if (id === null) { res.status(400).json({ error: "ID de reunião inválido." }); return; }
  const record = await getMeetingRecord(id);
  if (!record) { res.status(404).json({ error: "Reunião não encontrada." }); return; }
  await db.delete(meetingsTable).where(eq(meetingsTable.id, id));
  res.status(204).send();
});

export default router;