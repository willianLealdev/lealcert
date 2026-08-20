import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const meetingsTable = pgTable("meetings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  status: text("status").notNull().default("scheduled"),
  roomSlug: text("room_slug").notNull().unique(),
  meetingUrl: text("meeting_url").notNull(),
  organizerUserId: integer("organizer_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("meetings_organizer_idx").on(table.organizerUserId),
  index("meetings_scheduled_at_idx").on(table.scheduledAt),
  index("meetings_status_idx").on(table.status),
]);

export const meetingParticipantsTable = pgTable("meeting_participants", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetingsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  invitationStatus: text("invitation_status").notNull().default("pending"),
  lastInvitedAt: timestamp("last_invited_at", { withTimezone: true }),
  invitationError: text("invitation_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("meeting_participants_meeting_idx").on(table.meetingId),
  uniqueIndex("meeting_participants_meeting_email_idx").on(table.meetingId, table.email),
]);

export const insertMeetingSchema = createInsertSchema(meetingsTable).omit({ id: true, createdAt: true, updatedAt: true, cancelledAt: true });
export const insertMeetingParticipantSchema = createInsertSchema(meetingParticipantsTable).omit({ id: true, createdAt: true, lastInvitedAt: true, invitationError: true });
export type Meeting = typeof meetingsTable.$inferSelect;
export type MeetingParticipant = typeof meetingParticipantsTable.$inferSelect;
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type InsertMeetingParticipant = z.infer<typeof insertMeetingParticipantSchema>;