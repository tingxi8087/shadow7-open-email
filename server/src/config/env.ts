import { fileURLToPath } from "node:url";

export type ServerConfig = {
  host: string;
  port: number;
  databasePath: string;
  webDistPath: string;
  attachmentDir: string;
  publicHost: string;
  cookie: {
    secure: boolean;
  };
  smtpInbound: {
    enabled: boolean;
    host: string;
    port: number;
    maxMessageSizeBytes: number;
    attachmentDir: string;
  };
};

const defaultDatabasePath = fileURLToPath(new URL("../../data/shadow7-mail.sqlite", import.meta.url));
const defaultWebDistPath = fileURLToPath(new URL("../../web/dist", import.meta.url));
const defaultAttachmentDir = fileURLToPath(new URL("../../data/attachments", import.meta.url));

export function loadConfig(): ServerConfig {
  return {
    host: Bun.env.HOST ?? "127.0.0.1",
    port: Number(Bun.env.PORT ?? 5160),
    databasePath: Bun.env.DATABASE_PATH ?? defaultDatabasePath,
    webDistPath: Bun.env.WEB_DIST_PATH ?? defaultWebDistPath,
    attachmentDir: Bun.env.ATTACHMENT_DIR ?? defaultAttachmentDir,
    publicHost: Bun.env.PUBLIC_HOST ?? "",
    cookie: {
      secure: Bun.env.COOKIE_SECURE === "true",
    },
    smtpInbound: {
      enabled: Bun.env.SMTP_INBOUND_ENABLED !== "false",
      host: Bun.env.SMTP_INBOUND_HOST ?? "0.0.0.0",
      port: Number(Bun.env.SMTP_INBOUND_PORT ?? 2525),
      maxMessageSizeBytes: Number(Bun.env.SMTP_INBOUND_MAX_BYTES ?? 10 * 1024 * 1024),
      attachmentDir: Bun.env.ATTACHMENT_DIR ?? defaultAttachmentDir,
    },
  };
}
