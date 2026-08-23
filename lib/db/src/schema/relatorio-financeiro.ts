import { pgTable, serial, integer, numeric, text, boolean, timestamp } from "drizzle-orm/pg-core";

/** Faixas progressivas (flat-rate): quando o total do período atingir a faixa, o custo por cert é o desta faixa. */
export const reportCertTiersTable = pgTable("report_cert_tiers", {
  id: serial("id").primaryKey(),
  minQty: integer("min_qty").notNull(),
  maxQty: integer("max_qty"), // null = ilimitado
  pricePerCert: numeric("price_per_cert", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Taxas por método de pagamento: valor fixo + percentual (por venda). Uma linha por método. */
export const reportPaymentFeesTable = pgTable("report_payment_fees", {
  id: serial("id").primaryKey(),
  method: text("method").notNull(), // pix | boleto | cartao | cortesia
  fixedFee: numeric("fixed_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  percentFee: numeric("percent_fee", { precision: 5, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Custos adicionais recorrentes: diário, mensal ou anual. Rateados conforme período do relatório. */
export const reportExtraCostsTable = pgTable("report_extra_costs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  period: text("period").notNull(), // daily | monthly | annual
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
