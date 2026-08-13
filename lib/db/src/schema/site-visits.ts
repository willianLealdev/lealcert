import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const siteVisitsTable = pgTable("site_visits", {
  id: serial("id").primaryKey(),
  path: text("path").notNull(),                  // ex: /entrar, /comprar
  pageTitle: text("page_title"),                 // nome amigável da página
  ip: text("ip"),
  country: text("country"),
  countryCode: text("country_code"),
  region: text("region"),
  city: text("city"),
  isp: text("isp"),
  userId: integer("user_id"),                    // preenchido se logado
  userAgent: text("user_agent"),
  device: text("device"),                        // "mobile" | "desktop" | "tablet"
  referrer: text("referrer"),
  sessionId: text("session_id"),                 // UUID gerado no frontend por sessão
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
