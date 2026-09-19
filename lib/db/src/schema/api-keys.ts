import { pgTable, text, serial, timestamp, boolean, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tokenPrefix: text("token_prefix").notNull().unique(),
  tokenHash: text("token_hash").notNull(),
  accessLevel: text("access_level").notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  telephonyCapabilities: jsonb("telephony_capabilities").$type<string[]>().notNull().default([]),
  aiWebhookUrl: text("ai_webhook_url"),
  aiWebhookKey: text("ai_webhook_key"),
  aiWebhookSecretEncrypted: text("ai_webhook_secret_encrypted"),
  allowedIps: jsonb("allowed_ips").$type<string[]>().notNull().default([]),
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(60),
  createdByUserId: integer("created_by_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("api_keys_created_by_idx").on(table.createdByUserId),
]);

export const apiKeyAuditLogsTable = pgTable("api_key_audit_logs", {
  id: serial("id").primaryKey(),
  apiKeyId: integer("api_key_id").references(() => apiKeysTable.id, { onDelete: "set null" }),
  tokenPrefix: text("token_prefix").notNull(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  scope: text("scope"),
  statusCode: integer("status_code").notNull(),
  durationMs: integer("duration_ms").notNull(),
  sourceIp: text("source_ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("api_key_audit_key_created_idx").on(table.apiKeyId, table.createdAt),
]);

export const insertApiKeySchema = createInsertSchema(apiKeysTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeysTable.$inferSelect;
export type ApiKeyAuditLog = typeof apiKeyAuditLogsTable.$inferSelect;