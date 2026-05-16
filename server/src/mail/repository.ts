import { eq } from "drizzle-orm";
import type { DbClient } from "../db/client";
import { adminAccount, messages, systemSettings, type NewMessage } from "../db/schema";

export async function getPrimaryDomain(db: DbClient) {
  const row = await db.query.systemSettings.findFirst({
    where: eq(systemSettings.key, "primary_domain"),
  });

  return row?.value.trim().toLowerCase() || null;
}

export async function getSetting(db: DbClient, key: string) {
  const row = await db.query.systemSettings.findFirst({
    where: eq(systemSettings.key, key),
  });

  return row?.value ?? null;
}

export async function setSetting(db: DbClient, key: string, value: string) {
  const now = new Date().toISOString();

  await db
    .insert(systemSettings)
    .values({
      key,
      value,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value,
        updatedAt: now,
      },
    });
}

export async function getAdminEmail(db: DbClient) {
  const row = await db.query.adminAccount.findFirst({
    where: eq(adminAccount.id, 1),
  });

  return row?.email.trim().toLowerCase() || null;
}

export async function createIncomingMessage(db: DbClient, message: NewMessage) {
  const [created] = await db
    .insert(messages)
    .values(message)
    .onConflictDoNothing({
      target: messages.messageId,
    })
    .returning();

  return created;
}

export async function createSentMessage(db: DbClient, message: NewMessage) {
  const [created] = await db.insert(messages).values(message).returning();
  return created;
}
