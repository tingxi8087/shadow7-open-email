import { and, desc, eq, like, or, sql } from "drizzle-orm";
import type { DbClient } from "../db/client";
import { attachments, messages, type Message } from "../db/schema";

export type MessageFolder = "inbox" | "sent" | "trash";
export type MessageFilter = "all" | "unread" | "starred" | "attachments";

type ListMessagesInput = {
  folder?: MessageFolder | "all";
  filter?: MessageFilter;
  q?: string;
  page: number;
  pageSize: number;
};

type UpdateMessageInput = {
  isRead?: boolean;
  isStarred?: boolean;
  folder?: MessageFolder;
};

export async function listMessages(db: DbClient, input: ListMessagesInput) {
  const where = [];
  const folder = input.folder ?? "inbox";
  const filter = input.filter ?? "all";
  const q = input.q?.trim();

  if (folder !== "all") {
    where.push(eq(messages.folder, folder));
  }

  if (filter === "unread") {
    where.push(eq(messages.isRead, false));
  } else if (filter === "starred") {
    where.push(eq(messages.isStarred, true));
  } else if (filter === "attachments") {
    where.push(eq(messages.hasAttachments, true));
  }

  if (q) {
    const pattern = `%${q}%`;
    where.push(
      or(
        like(messages.fromEmail, pattern),
        like(messages.subject, pattern),
        like(messages.textBody, pattern),
      ),
    );
  }

  const whereClause = where.length ? and(...where) : undefined;
  const totalRows = (await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(messages)
    .where(whereClause)) as Array<{ count: number }>;
  const total = Number(totalRows[0]?.count ?? 0);

  const items = await db
    .select()
    .from(messages)
    .where(whereClause)
    .orderBy(desc(sql`COALESCE(${messages.receivedAt}, ${messages.sentAt}, ${messages.createdAt})`))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);

  return {
    items,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

export async function getMessage(db: DbClient, id: number) {
  return db.query.messages.findFirst({
    where: eq(messages.id, id),
    with: {
      attachments: true,
    },
  });
}

export async function getAttachment(db: DbClient, id: number) {
  return db.query.attachments.findFirst({
    where: eq(attachments.id, id),
  });
}

export async function createAttachment(
  db: DbClient,
  input: {
    messageId: number;
    filename: string;
    mimeType: string;
    size: number;
    storagePath: string;
  },
) {
  const [attachment] = await db.insert(attachments).values(input).returning();
  return attachment;
}

export async function updateMessage(db: DbClient, id: number, input: UpdateMessageInput) {
  const patch: Partial<Pick<Message, "isRead" | "isStarred" | "folder" | "updatedAt">> = {
    updatedAt: new Date().toISOString(),
  };

  if (typeof input.isRead === "boolean") {
    patch.isRead = input.isRead;
  }
  if (typeof input.isStarred === "boolean") {
    patch.isStarred = input.isStarred;
  }
  if (input.folder) {
    patch.folder = input.folder;
  }

  const [message] = await db.update(messages).set(patch).where(eq(messages.id, id)).returning();
  return message;
}

export async function getMessageCounts(db: DbClient) {
  const rows = (await db
    .select({
      folder: messages.folder,
      count: sql<number>`count(*)`,
    })
    .from(messages)
    .groupBy(messages.folder)) as Array<{ folder: MessageFolder; count: number }>;

  const unreadRows = (await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(messages)
    .where(and(eq(messages.folder, "inbox"), eq(messages.isRead, false)))) as Array<{
    count: number;
  }>;

  return {
    inbox: rows.find((row) => row.folder === "inbox")?.count ?? 0,
    sent: rows.find((row) => row.folder === "sent")?.count ?? 0,
    trash: rows.find((row) => row.folder === "trash")?.count ?? 0,
    unread: unreadRows[0]?.count ?? 0,
  };
}
