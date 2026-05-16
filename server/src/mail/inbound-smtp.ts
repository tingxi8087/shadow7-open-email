import { SMTPServer, type SMTPAddress, type SMTPSession, type SMTPServerError } from "smtp-server";
import { simpleParser, type ParsedMailAddressObject } from "mailparser";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import type { DbClient } from "../db/client";
import { createAttachment } from "../repositories/messages";
import { createIncomingMessage, getPrimaryDomain } from "./repository";

type Logger = {
  info: (payload: unknown, message?: string) => void;
  warn: (payload: unknown, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
};

export type InboundSmtpConfig = {
  enabled: boolean;
  host: string;
  port: number;
  maxMessageSizeBytes: number;
  attachmentDir: string;
};

type InboundSmtpServiceOptions = {
  db: DbClient;
  config: InboundSmtpConfig;
  logger: Logger;
};

function smtpError(message: string, responseCode: number): SMTPServerError {
  const error = new Error(message) as SMTPServerError;
  error.responseCode = responseCode;
  return error;
}

function safeFilename(value: string | undefined, index: number) {
  const fallback = `attachment-${index + 1}`;
  const cleaned = (value || fallback)
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

function normalizeEmail(address: string) {
  return address.trim().toLowerCase();
}

function isAcceptedRecipient(address: string, primaryDomain: string) {
  const normalizedAddress = normalizeEmail(address);
  const normalizedDomain = primaryDomain.trim().toLowerCase();

  return normalizedAddress.endsWith(`@${normalizedDomain}`) && normalizedAddress.split("@").length === 2;
}

function collectStream(stream: Readable & { sizeExceeded?: boolean }, maxBytes: number) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    stream.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;

      if (size > maxBytes) {
        stream.destroy(smtpError("Message exceeds maximum size", 552));
        return;
      }

      chunks.push(buffer);
    });
    stream.once("error", reject);
    stream.once("end", () => {
      if (stream.sizeExceeded) {
        reject(smtpError("Message exceeds maximum size", 552));
        return;
      }

      resolve(Buffer.concat(chunks, size));
    });
  });
}

function addressesFromObject(value?: ParsedMailAddressObject | ParsedMailAddressObject[]) {
  const objects = Array.isArray(value) ? value : value ? [value] : [];

  return objects.flatMap((object) =>
    (object.value ?? [])
      .map((address) => address.address?.trim())
      .filter((address): address is string => Boolean(address)),
  );
}

export class InboundSmtpService {
  private readonly db: DbClient;
  private readonly config: InboundSmtpConfig;
  private readonly logger: Logger;
  private server?: SMTPServer;

  constructor(options: InboundSmtpServiceOptions) {
    this.db = options.db;
    this.config = options.config;
    this.logger = options.logger;
  }

  async start() {
    if (!this.config.enabled) {
      this.logger.info({ smtpInbound: "disabled" }, "Inbound SMTP disabled");
      return;
    }

    this.server = new SMTPServer({
      authOptional: true,
      disabledCommands: ["AUTH", "STARTTLS"],
      size: this.config.maxMessageSizeBytes,
      onRcptTo: (address, _session, callback) => {
        this.handleRcptTo(address)
          .then(() => callback())
          .catch((error) => callback(error instanceof Error ? error : smtpError("Recipient rejected", 550)));
      },
      onData: (stream, session, callback) => {
        this.handleData(stream, session)
          .then((messageId) => callback(null, `Message queued as ${messageId}`))
          .catch((error) => callback(error instanceof Error ? error : smtpError("Message rejected", 550)));
      },
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server?.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server?.off("error", onError);
        resolve();
      };

      this.server?.once("error", onError);
      this.server?.server.once("listening", onListening);
      this.server?.listen(this.config.port, this.config.host);
    });

    this.server.on("error", (error) => {
      this.logger.error({ error }, "Inbound SMTP server error");
    });

    this.logger.info(
      { host: this.config.host, port: this.config.port },
      "Inbound SMTP server listening",
    );
  }

  async stop() {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    this.server = undefined;
  }

  private async handleRcptTo(address: SMTPAddress) {
    const primaryDomain = await getPrimaryDomain(this.db);
    if (!primaryDomain) {
      throw smtpError("Primary domain is not configured", 451);
    }

    if (!isAcceptedRecipient(address.address, primaryDomain)) {
      throw smtpError("Recipient domain is not accepted", 550);
    }
  }

  private async handleData(stream: Readable & { sizeExceeded?: boolean }, session: SMTPSession) {
    const primaryDomain = await getPrimaryDomain(this.db);
    if (!primaryDomain) {
      throw smtpError("Primary domain is not configured", 451);
    }

    const acceptedRecipients = session.envelope.rcptTo
      .map((recipient) => recipient.address)
      .filter((address) => isAcceptedRecipient(address, primaryDomain))
      .map(normalizeEmail);

    if (!acceptedRecipients.length) {
      throw smtpError("No accepted recipients", 550);
    }

    const rawBuffer = await collectStream(stream, this.config.maxMessageSizeBytes);
    const rawSource = rawBuffer.toString("utf8");
    const parsed = await simpleParser(rawBuffer);
    const now = new Date().toISOString();
    const fromEmail = addressesFromObject(parsed.from)[0] ?? normalizeEmail(session.envelope.mailFrom?.address ?? "");

    if (!fromEmail) {
      throw smtpError("Sender is missing", 550);
    }

    const toEmails = addressesFromObject(parsed.to);
    const ccEmails = addressesFromObject(parsed.cc);
    const bccEmails = addressesFromObject(parsed.bcc);
    const messageId = parsed.messageId || `incoming-${crypto.randomUUID()}`;

    const message = await createIncomingMessage(this.db, {
      messageId,
      fromEmail,
      toEmails: JSON.stringify(toEmails.length ? toEmails : acceptedRecipients),
      ccEmails: JSON.stringify(ccEmails),
      bccEmails: JSON.stringify(bccEmails),
      subject: parsed.subject ?? "",
      textBody: parsed.text,
      htmlBody: typeof parsed.html === "string" ? parsed.html : undefined,
      rawSource,
      folder: "inbox",
      direction: "incoming",
      isRead: false,
      isStarred: false,
      hasAttachments: Boolean(parsed.attachments?.length),
      receivedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    if (message && parsed.attachments?.length) {
      const messageDir = join(this.config.attachmentDir, String(message.id));
      await mkdir(messageDir, { recursive: true });

      await Promise.all(
        parsed.attachments.map(async (attachment, index) => {
          const filename = safeFilename(attachment.filename, index);
          const storagePath = join(messageDir, `${index + 1}-${filename}`);

          await writeFile(storagePath, attachment.content);
          await createAttachment(this.db, {
            messageId: message.id,
            filename,
            mimeType: attachment.contentType || "application/octet-stream",
            size: attachment.size || attachment.content.byteLength,
            storagePath,
          });
        }),
      );
    }

    return messageId;
  }
}
