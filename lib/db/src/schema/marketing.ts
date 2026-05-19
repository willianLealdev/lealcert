import { pgTable, serial, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const marketingContactsTable = pgTable("marketing_contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  tags: text("tags"),
  status: text("status").notNull().default("active"),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  bounced: boolean("bounced").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const marketingCampaignsTable = pgTable("marketing_campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),
  fromName: text("from_name").notNull().default("LealCert Marketing"),
  fromEmail: text("from_email").notNull().default("mkt@lealcert.com.br"),
  replyTo: text("reply_to"),
  status: text("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  totalSent: integer("total_sent").notNull().default(0),
  totalDelivered: integer("total_delivered").notNull().default(0),
  totalOpened: integer("total_opened").notNull().default(0),
  totalClicked: integer("total_clicked").notNull().default(0),
  totalBounced: integer("total_bounced").notNull().default(0),
  totalReplied: integer("total_replied").notNull().default(0),
  filterTags: text("filter_tags"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const marketingSendsTable = pgTable("marketing_sends", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => marketingCampaignsTable.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").notNull().references(() => marketingContactsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  error: text("error"),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  openCount: integer("open_count").notNull().default(0),
  trackingToken: text("tracking_token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.campaignId, t.contactId)]);

export const marketingRepliesTable = pgTable("marketing_replies", {
  id: serial("id").primaryKey(),
  sendId: integer("send_id").references(() => marketingSendsTable.id),
  contactId: integer("contact_id").references(() => marketingContactsTable.id),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  subject: text("subject"),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  readAt: timestamp("read_at", { withTimezone: true }),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  replyBody: text("reply_body"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const marketingTemplatesTable = pgTable("marketing_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMarketingContactSchema = createInsertSchema(marketingContactsTable).omit({ id: true, createdAt: true });
export type InsertMarketingContact = z.infer<typeof insertMarketingContactSchema>;
export const selectMarketingContactSchema = createSelectSchema(marketingContactsTable);
export type MarketingContact = z.infer<typeof selectMarketingContactSchema>;

export const insertMarketingCampaignSchema = createInsertSchema(marketingCampaignsTable).omit({ id: true, createdAt: true, updatedAt: true, totalSent: true, totalDelivered: true, totalOpened: true, totalClicked: true, totalBounced: true, totalReplied: true });
export type InsertMarketingCampaign = z.infer<typeof insertMarketingCampaignSchema>;
export const selectMarketingCampaignSchema = createSelectSchema(marketingCampaignsTable);
export type MarketingCampaign = z.infer<typeof selectMarketingCampaignSchema>;
