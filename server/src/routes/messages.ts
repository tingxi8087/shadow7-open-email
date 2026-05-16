import type { FastifyPluginAsync } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { ensureDkimKeys, getDkimDnsRecord } from "../mail/dkim";
import { getOutboundSettings, getRelayConfig } from "../mail/outbound-settings";
import { sendOutboundMail } from "../mail/outbound-smtp";
import { createSentMessage, getAdminEmail, getPrimaryDomain, getSetting } from "../mail/repository";
import { sendViaSmtpRelay } from "../mail/smtp-relay";
import {
  getMessage,
  getAttachment,
  getMessageCounts,
  listMessages,
  updateMessage,
  type MessageFilter,
  type MessageFolder,
} from "../repositories/messages";

type ListQuery = {
  folder?: MessageFolder | "all";
  filter?: MessageFilter;
  q?: string;
  page?: string;
  pageSize?: string;
};

type SendBody = {
  fromLocalPart?: string;
  fromName?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  textBody?: string;
};

type UpdateBody = {
  isRead?: boolean;
  isStarred?: boolean;
  folder?: MessageFolder;
};

const validFolders = new Set(["all", "inbox", "sent", "trash"]);
const validFilters = new Set(["all", "unread", "starred", "attachments"]);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidLocalPart(value: string) {
  return /^[a-z0-9._-]{1,64}$/i.test(value) && !value.startsWith(".") && !value.endsWith(".");
}

function sanitizeDisplayName(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 80);
}

export const messageRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: ListQuery }>("/messages", async (request, reply) => {
    const folder = request.query.folder ?? "inbox";
    const filter = request.query.filter ?? "all";
    const page = Math.max(1, Number(request.query.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(5, Number(request.query.pageSize ?? 10) || 10));

    if (!validFolders.has(folder) || !validFilters.has(filter)) {
      return reply.code(400).send({
        code: "invalid_query",
        message: "邮件筛选参数无效。",
      });
    }

    const result = await listMessages(app.db, {
      folder,
      filter,
      q: request.query.q,
      page,
      pageSize,
    });
    const counts = await getMessageCounts(app.db);

    return {
      items: result.items,
      counts,
      pagination: result.pagination,
    };
  });

  app.get<{ Params: { id: string } }>("/messages/:id", async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) {
      return reply.code(400).send({
        code: "invalid_id",
        message: "邮件 ID 无效。",
      });
    }

    const message = await getMessage(app.db, id);
    if (!message) {
      return reply.code(404).send({
        code: "not_found",
        message: "邮件不存在。",
      });
    }

    return {
      message,
    };
  });

  app.post<{ Body: SendBody }>("/messages/send", async (request, reply) => {
    const to = (request.body.to ?? []).map(normalizeEmail);
    const cc = (request.body.cc ?? []).map(normalizeEmail);
    const bcc = (request.body.bcc ?? []).map(normalizeEmail);
    const subject = request.body.subject?.trim() ?? "";
    const textBody = request.body.textBody?.trim() ?? "";
    const fromName = sanitizeDisplayName(request.body.fromName ?? (await getSetting(app.db, "sender_display_name")) ?? "");
    const primaryDomain = await getPrimaryDomain(app.db);

    if (!primaryDomain) {
      return reply.code(409).send({
        code: "domain_not_configured",
        message: "请先配置主域名。",
      });
    }
    if (!to.length || [...to, ...cc, ...bcc].some((email) => !isEmail(email))) {
      return reply.code(400).send({
        code: "invalid_recipients",
        message: "请输入有效收件人。",
      });
    }
    if (!subject) {
      return reply.code(400).send({
        code: "missing_subject",
        message: "请输入邮件主题。",
      });
    }
    if (!textBody) {
      return reply.code(400).send({
        code: "missing_body",
        message: "请输入邮件正文。",
      });
    }

    const adminEmail = await getAdminEmail(app.db);
    const adminLocalPart =
      adminEmail?.endsWith(`@${primaryDomain}`) ? adminEmail.slice(0, -primaryDomain.length - 1) : null;
    const fromLocalPart = (request.body.fromLocalPart?.trim() || adminLocalPart || "admin").toLowerCase();

    if (!isValidLocalPart(fromLocalPart)) {
      return reply.code(400).send({
        code: "invalid_sender",
        message: "发件人只能包含字母、数字、点、下划线和短横线。",
      });
    }

    const fromEmail = `${fromLocalPart}@${primaryDomain}`;
    const now = new Date().toISOString();
    const messageId = `<${crypto.randomUUID()}@${primaryDomain}>`;
    let rawSource: string;
    const outboundSettings = await getOutboundSettings(app.db);

    try {
      const mailInput = {
        from: fromEmail,
        fromName,
        to,
        cc,
        bcc,
        subject,
        textBody,
        messageId,
        domain: primaryDomain,
      };

      if (outboundSettings.mode === "smtp") {
        const relay = await getRelayConfig(app.db);
        if (!relay) {
          return reply.code(409).send({
            code: "relay_not_configured",
            message: "SMTP Relay 尚未配置完整。",
          });
        }

        rawSource = await sendViaSmtpRelay(mailInput, relay);
      } else {
        const dkimKeys = await ensureDkimKeys(app.db);
        rawSource = await sendOutboundMail({
          ...mailInput,
          dkimPrivateKey: dkimKeys.privateKey,
        });
      }
    } catch (error) {
      request.log.warn({ error }, "Outbound SMTP delivery failed");
      return reply.code(502).send({
        code: "delivery_failed",
        message: error instanceof Error ? error.message : "邮件投递失败。",
      });
    }

    const message = await createSentMessage(app.db, {
      messageId,
      fromEmail,
      toEmails: JSON.stringify(to),
      ccEmails: JSON.stringify(cc),
      bccEmails: JSON.stringify(bcc),
      subject,
      textBody,
      rawSource,
      folder: "sent",
      direction: "outgoing",
      isRead: true,
      isStarred: false,
      hasAttachments: false,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return {
      ok: true,
      message,
    };
  });

  app.get<{ Params: { id: string; attachmentId: string } }>("/messages/:id/attachments/:attachmentId/download", async (request, reply) => {
    const messageId = Number(request.params.id);
    const attachmentId = Number(request.params.attachmentId);

    if (!Number.isInteger(messageId) || !Number.isInteger(attachmentId)) {
      return reply.code(400).send({
        code: "invalid_id",
        message: "附件 ID 无效。",
      });
    }

    const attachment = await getAttachment(app.db, attachmentId);
    if (!attachment || attachment.messageId !== messageId) {
      return reply.code(404).send({
        code: "not_found",
        message: "附件不存在。",
      });
    }

    try {
      await stat(attachment.storagePath);
    } catch {
      return reply.code(404).send({
        code: "file_missing",
        message: "附件文件不存在。",
      });
    }

    const filename = encodeURIComponent(attachment.filename).replace(/['()]/g, escape);
    reply.header("Content-Type", attachment.mimeType || "application/octet-stream");
    reply.header("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
    return reply.send(createReadStream(attachment.storagePath));
  });

  app.get("/mail/dns-records", async (_request, reply) => {
    const primaryDomain = await getPrimaryDomain(app.db);

    if (!primaryDomain) {
      return reply.code(409).send({
        code: "domain_not_configured",
        message: "请先配置主域名。",
      });
    }

    const dkim = await getDkimDnsRecord(app.db, primaryDomain);
    const publicHost = await getSetting(app.db, "public_host");

    return {
      records: [
        {
          type: "A",
          host: `mail.${primaryDomain}`,
          value: publicHost || "服务器公网 IP",
        },
        {
          type: "MX",
          host: primaryDomain,
          value: `10 mail.${primaryDomain}`,
        },
        {
          type: "TXT",
          host: primaryDomain,
          value: publicHost ? `v=spf1 ip4:${publicHost} mx -all` : "v=spf1 mx -all",
        },
        dkim,
        {
          type: "TXT",
          host: `_dmarc.${primaryDomain}`,
          value: `v=DMARC1; p=none; rua=mailto:dmarc@${primaryDomain}`,
        },
      ],
    };
  });

  app.patch<{ Params: { id: string }; Body: UpdateBody }>("/messages/:id", async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) {
      return reply.code(400).send({
        code: "invalid_id",
        message: "邮件 ID 无效。",
      });
    }

    if (request.body.folder && !["inbox", "sent", "trash"].includes(request.body.folder)) {
      return reply.code(400).send({
        code: "invalid_folder",
        message: "目标文件夹无效。",
      });
    }

    const message = await updateMessage(app.db, id, request.body);
    if (!message) {
      return reply.code(404).send({
        code: "not_found",
        message: "邮件不存在。",
      });
    }

    return {
      ok: true,
      message,
    };
  });
};
