import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { marketingContactsTable } from "./marketing";

export const discagemCampaignsTable = pgTable("discagem_campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  // draft | running | paused | completed | error | credit_error
  pauseReason: text("pause_reason"),           // texto explicativo se pausado por erro
  pausedApi: text("paused_api"),               // qual API causou o pause: TWILIO | DEEPGRAM | CLAUDE | DEEPSEEK | CARTESIA | ELEVENLABS

  // ALVO
  targetType: text("target_type").notNull().default("all"),
  // all | clientes | contadores | contact_ids | manual_number
  targetContactIds: text("target_contact_ids"),   // JSON array of contact IDs
  manualNumber: text("manual_number"),             // para discar um número avulso
  filterDdd: text("filter_ddd"),                  // DDDs permitidos, ex: "11,17,21" (null = todos)

  // IA
  aiModel: text("ai_model").notNull().default("claude"),    // claude | deepseek | openai
  agentName: text("agent_name").notNull().default("Willian"), // Willian | Aline
  ttsProvider: text("tts_provider").notNull().default("cartesia"), // cartesia | elevenlabs
  ttsVoiceId: text("tts_voice_id"),                 // voice id do provedor (auto se null)

  // JANELA DE HORÁRIO (horas inteiras em horário de Brasília)
  windowMorningStart: integer("window_morning_start").notNull().default(9),
  windowMorningEnd: integer("window_morning_end").notNull().default(12),
  windowAfternoonStart: integer("window_afternoon_start").notNull().default(13),
  windowAfternoonEnd: integer("window_afternoon_end").notNull().default(16),
  windowDays: text("window_days").notNull().default('["mon","tue","wed","thu"]'), // JSON

  // LIMITES
  maxConcurrentCalls: integer("max_concurrent_calls").notNull().default(3),
  maxAttempts: integer("max_attempts").notNull().default(2),

  // CONTADORES
  totalCalled: integer("total_called").notNull().default(0),
  totalAnswered: integer("total_answered").notNull().default(0),
  totalVoicemail: integer("total_voicemail").notNull().default(0),
  totalOptout: integer("total_optout").notNull().default(0),
  totalNoAnswer: integer("total_no_answer").notNull().default(0),
  totalFailed: integer("total_failed").notNull().default(0),

  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const discagemCallsTable = pgTable("discagem_calls", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => discagemCampaignsTable.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").references(() => marketingContactsTable.id, { onDelete: "set null" }),
  phoneNumber: text("phone_number").notNull(),
  contactName: text("contact_name"),

  twilioCallSid: text("twilio_call_sid").unique(),
  status: text("status").notNull().default("queued"),
  // queued | dialing | in_progress | answered | voicemail | no_answer | failed | optout | busy

  outcome: text("outcome"),
  // answered | no_answer | voicemail | failed | optout | busy | invalid

  attemptNumber: integer("attempt_number").notNull().default(1),
  retryAfter: timestamp("retry_after", { withTimezone: true }),

  // Conversa
  transcript: text("transcript"),  // JSON array de turns [{role, text, ts}]
  recordingUrl: text("recording_url"),
  durationSeconds: integer("duration_seconds"),

  // E-mail de follow-up
  contactEmail: text("contact_email"),            // e-mail capturado durante a ligação
  wantsFollowupEmail: boolean("wants_followup_email").notNull().default(false),
  followupEmailSentAt: timestamp("followup_email_sent_at", { withTimezone: true }),

  // Metadados
  aiModelUsed: text("ai_model_used"),
  ttsProviderUsed: text("tts_provider_used"),
  error: text("error"),

  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
