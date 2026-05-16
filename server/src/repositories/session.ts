import { eq, lt, sql } from "drizzle-orm";
import type { DbClient } from "../db/client";
import { sessions } from "../db/schema";

export async function createSession(
  db: DbClient,
  input: {
    id: string;
    tokenHash: string;
    expiresAt: string;
  },
) {
  await db.insert(sessions).values({
    id: input.id,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
    createdAt: new Date().toISOString(),
  });
}

export async function getSessionByHash(db: DbClient, tokenHash: string) {
  return db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, tokenHash),
  });
}

export async function touchSession(db: DbClient, id: string) {
  await db
    .update(sessions)
    .set({
      lastSeenAt: new Date().toISOString(),
    })
    .where(eq(sessions.id, id));
}

export async function deleteSessionByHash(db: DbClient, tokenHash: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function deleteOtherSessions(db: DbClient, sessionId: string) {
  await db.delete(sessions).where(sql`${sessions.id} != ${sessionId}`);
}

export async function deleteExpiredSessions(db: DbClient) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString()));
}
