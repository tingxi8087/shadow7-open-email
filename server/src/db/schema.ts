import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const adminAccount = sqliteTable("admin_account", {
  id: integer("id").primaryKey().default(1),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastLoginAt: text("last_login_at"),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at"),
  },
  (table) => [index("sessions_expires_at_idx").on(table.expiresAt)],
);

export const systemSettings = sqliteTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const dnsRecords = sqliteTable(
  "dns_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: ["MX", "SPF", "DKIM", "DMARC"] }).notNull(),
    host: text("host").notNull(),
    value: text("value").notNull(),
    ttl: integer("ttl").notNull().default(600),
    status: text("status", { enum: ["pending", "verified", "missing"] })
      .notNull()
      .default("pending"),
    lastCheckedAt: text("last_checked_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("dns_records_type_host_idx").on(table.type, table.host)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    messageId: text("message_id"),
    fromEmail: text("from_email").notNull(),
    toEmails: text("to_emails").notNull().default("[]"),
    ccEmails: text("cc_emails").notNull().default("[]"),
    bccEmails: text("bcc_emails").notNull().default("[]"),
    subject: text("subject").notNull().default(""),
    textBody: text("text_body"),
    htmlBody: text("html_body"),
    rawSource: text("raw_source"),
    folder: text("folder", { enum: ["inbox", "sent", "trash"] }).notNull(),
    direction: text("direction", { enum: ["incoming", "outgoing"] }).notNull(),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    isStarred: integer("is_starred", { mode: "boolean" }).notNull().default(false),
    hasAttachments: integer("has_attachments", { mode: "boolean" }).notNull().default(false),
    sentAt: text("sent_at"),
    receivedAt: text("received_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("messages_message_id_idx").on(table.messageId),
    index("messages_folder_created_at_idx").on(table.folder, table.createdAt),
    index("messages_direction_idx").on(table.direction),
  ],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    messageId: integer("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    storagePath: text("storage_path").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("attachments_message_id_idx").on(table.messageId)],
);

export const systemEvents = sqliteTable(
  "system_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(),
    level: text("level", { enum: ["info", "warning", "error"] }).notNull().default("info"),
    message: text("message").notNull(),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("system_events_type_created_at_idx").on(table.type, table.createdAt)],
);

export const messagesRelations = relations(messages, ({ many }) => ({
  attachments: many(attachments),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  message: one(messages, {
    fields: [attachments.messageId],
    references: [messages.id],
  }),
}));

export type AdminAccount = typeof adminAccount.$inferSelect;
export type NewAdminAccount = typeof adminAccount.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
