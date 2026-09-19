import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

export type Role = "USER" | "RESELLER" | "ADMIN";
export type BotStatus =
  | "offline"
  | "connecting"
  | "online"
  | "reconnecting"
  | "error";

/* ------------------------------ users ------------------------------ */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 32 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 12 }).notNull().default("USER"),
  plan: varchar("plan", { length: 20 }).notNull().default("FREE"),
  suspended: boolean("suspended").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

/* ---------------------------- auth bits ---------------------------- */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    userAgent: text("user_agent"),
    ip: varchar("ip", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)]
);

export const passwordResets = pgTable("password_resets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const emailVerifications = pgTable("email_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

/* ------------------------------- bots ------------------------------ */
export const bots = pgTable(
  "bots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    runtime: varchar("runtime", { length: 20 }).notNull().default("node"),
    prefix: varchar("prefix", { length: 4 }).notNull().default("!"),
    ownerNumber: varchar("owner_number", { length: 32 }),
    description: text("description"),
    status: varchar("status", { length: 16 }).notNull().default("offline"),
    sessionId: uuid("session_id").unique(),
    whatsappNumber: varchar("whatsapp_number", { length: 32 }),
    uptimeSec: integer("uptime_sec").notNull().default(0),
    messagesSent: integer("messages_sent").notNull().default(0),
    messagesReceived: integer("messages_received").notNull().default(0),
    settings: jsonb("settings").$type<any>().notNull().default({}),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("bots_user_idx").on(t.userId)]
);

export const whatsappSessions = pgTable(
  "whatsapp_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .unique()
      .references(() => bots.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("disconnected"),
    phoneNumber: varchar("phone_number", { length: 32 }),
    jid: varchar("jid", { length: 64 }),
    platform: varchar("platform", { length: 50 }),
    lastPairingCode: varchar("last_pairing_code", { length: 12 }),
    lastPairingAt: timestamp("last_pairing_at", { withTimezone: true }),
    qrDataUrl: text("qr_data_url"),
    lastQrAt: timestamp("last_qr_at", { withTimezone: true }),
    lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("wa_sessions_bot_idx").on(t.botId)]
);

/* ----------------------------- messages ---------------------------- */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id").references(() => bots.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    direction: varchar("direction", { length: 4 }).notNull().default("in"),
    type: varchar("type", { length: 24 }).notNull().default("text"),
    chatJid: varchar("chat_jid", { length: 64 }),
    chatName: varchar("chat_name", { length: 120 }),
    text: text("text"),
    meta: jsonb("meta").$type<any>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("messages_user_created_idx").on(t.userId, t.createdAt),
    index("messages_bot_created_idx").on(t.botId, t.createdAt),
  ]
);

/* ----------------------------- commands ---------------------------- */
export const commands = pgTable(
  "commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 40 }).notNull(),
    description: text("description").notNull().default(""),
    category: varchar("category", { length: 32 }).notNull().default("general"),
    enabled: boolean("enabled").notNull().default(true),
    handler: varchar("handler", { length: 32 }).notNull().default("builtin"),
    permissions: varchar("permissions", { length: 16 }).notNull().default("all"),
    premium: boolean("premium").notNull().default(false),
    extra: jsonb("extra").$type<any>().notNull().default({}),
    runCount: integer("run_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("commands_bot_idx").on(t.botId)]
);

/* --------------------------- automations --------------------------- */
export const automations = pgTable(
  "automations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    name: varchar("name", { length: 64 }).notNull().default("Automation"),
    trigger: jsonb("trigger").$type<any>().notNull().default({}),
    action: jsonb("action").$type<any>().notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("automations_bot_idx").on(t.botId)]
);

/* ----------------------------- api keys ---------------------------- */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull().default("API Key"),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
    botId: uuid("bot_id").references(() => bots.id, { onDelete: "set null" }),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    ipWhitelist: varchar("ip_whitelist", { length: 500 }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    requestCount: integer("request_count").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("api_keys_user_idx").on(t.userId)]
);

/* ----------------------------- webhooks ---------------------------- */
export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    events: jsonb("events").$type<string[]>().notNull().default([]),
    secret: varchar("secret", { length: 64 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    successCount: integer("success_count").notNull().default(0),
    failCount: integer("fail_count").notNull().default(0),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("webhooks_user_idx").on(t.userId)]
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    event: varchar("event", { length: 40 }).notNull(),
    payload: jsonb("payload").$type<any>(),
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    responseCode: integer("response_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("webhook_events_webhook_idx").on(t.webhookId, t.createdAt)]
);

/* ------------------------------- logs ------------------------------ */
export const logs = pgTable(
  "logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    botId: uuid("bot_id").references(() => bots.id, { onDelete: "set null" }),
    level: varchar("level", { length: 10 }).notNull().default("info"),
    event: varchar("event", { length: 60 }).notNull().default("system"),
    status: varchar("status", { length: 20 }),
    message: text("message").notNull().default(""),
    requestId: varchar("request_id", { length: 48 }),
    meta: jsonb("meta").$type<any>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("logs_user_created_idx").on(t.userId, t.createdAt),
    index("logs_level_created_idx").on(t.level, t.createdAt),
  ]
);

/* -------------------------- billing/usage --------------------------- */
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  plan: varchar("plan", { length: 20 }).notNull().default("FREE"),
  status: varchar("status", { length: 12 }).notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plan: varchar("plan", { length: 20 }).notNull(),
    amount: integer("amount").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("IDR"),
    method: varchar("method", { length: 24 }).notNull().default("manual"),
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    reference: varchar("reference", { length: 100 }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("payments_user_idx").on(t.userId, t.createdAt)]
);

/* -------------------------- notifications -------------------------- */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 40 }).notNull().default("info"),
    title: varchar("title", { length: 120 }).notNull(),
    body: text("body"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)]
);

/* ------------------------------ tickets ----------------------------- */
export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: varchar("subject", { length: 140 }).notNull(),
    status: varchar("status", { length: 12 }).notNull().default("open"),
    priority: varchar("priority", { length: 12 }).notNull().default("normal"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("tickets_user_idx").on(t.userId, t.createdAt)]
);

export const ticketMessages = pgTable("ticket_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* --------------------------- announcements ------------------------- */
export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 140 }).notNull(),
  content: text("content").notNull().default(""),
  type: varchar("type", { length: 16 }).notNull().default("info"),
  published: boolean("published").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------- system settings ------------------------- */
export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonb("value").$type<any>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/* ====================== WATER AI group features ===================== */
export const groupSettings = pgTable(
  "group_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    groupId: varchar("group_id", { length: 64 }).notNull(),
    settings: jsonb("settings").$type<any>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("group_settings_bot_idx").on(t.botId, t.groupId)]
);

export const groupWarnings = pgTable(
  "group_warnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    groupId: varchar("group_id", { length: 64 }).notNull(),
    jid: varchar("jid", { length: 64 }).notNull(),
    count: integer("count").notNull().default(0),
    reason: text("reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("group_warnings_idx").on(t.botId, t.groupId, t.jid)]
);

export const premiumUsers = pgTable(
  "premium_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    jid: varchar("jid", { length: 64 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    addedBy: varchar("added_by", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("premium_users_idx").on(t.botId, t.jid)]
);

export const gameScores = pgTable(
  "game_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    groupId: varchar("group_id", { length: 64 }).notNull(),
    jid: varchar("jid", { length: 64 }).notNull(),
    name: varchar("name", { length: 64 }),
    wins: integer("wins").notNull().default(0),
    total: integer("total").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("game_scores_idx").on(t.botId, t.groupId, t.jid)]
);

export const botOwners = pgTable(
  "bot_owners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    phone: varchar("phone", { length: 32 }).notNull(),
    addedBy: varchar("added_by", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("bot_owners_idx").on(t.botId)]
);

export const messageLimits = pgTable(
  "message_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    jid: varchar("jid", { length: 64 }).notNull(),
    date: varchar("date", { length: 10 }).notNull(),
    used: integer("used").notNull().default(0),
  },
  (t) => [uniqueIndex("message_limits_idx").on(t.botId, t.jid, t.date)]
);

export const banlist = pgTable(
  "banlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    jid: varchar("jid", { length: 64 }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("banlist_idx").on(t.botId, t.jid)]
);

/* ------------------------ public API request log ------------------- */
export const apiRequestLog = pgTable(
  "api_request_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyId: uuid("key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    botId: uuid("bot_id").references(() => bots.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    method: varchar("method", { length: 8 }).notNull(),
    path: text("path").notNull(),
    statusCode: integer("status_code").notNull().default(200),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("api_request_created_idx").on(t.createdAt)]
);


