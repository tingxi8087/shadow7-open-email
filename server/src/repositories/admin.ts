import { eq, sql } from "drizzle-orm";
import { adminAccount, systemSettings } from "../db/schema";
import type { DbClient } from "../db/client";

const adminId = 1;

export async function getAdmin(db: DbClient) {
  return db.query.adminAccount.findFirst({
    where: eq(adminAccount.id, adminId),
  });
}

export async function hasAdmin(db: DbClient) {
  const admin = await getAdmin(db);
  return Boolean(admin);
}

export async function createAdmin(
  db: DbClient,
  input: {
    email: string;
    passwordHash: string;
    displayName?: string;
  },
) {
  const now = new Date().toISOString();

  await db.insert(adminAccount).values({
    id: adminId,
    email: input.email,
    passwordHash: input.passwordHash,
    displayName: input.displayName || "Admin",
    createdAt: now,
    updatedAt: now,
  });

  await db
    .insert(systemSettings)
    .values({
      key: "setup_completed",
      value: "admin_created",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: "admin_created",
        updatedAt: now,
      },
    });

  return getAdmin(db);
}

export async function touchAdminLogin(db: DbClient) {
  await db
    .update(adminAccount)
    .set({
      lastLoginAt: sql`CURRENT_TIMESTAMP`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(adminAccount.id, adminId));
}

export async function updateAdminPassword(db: DbClient, passwordHash: string) {
  await db
    .update(adminAccount)
    .set({
      passwordHash,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(adminAccount.id, adminId));
}
