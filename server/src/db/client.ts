import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

export type SqliteClient = Database;
export type DbClient = BunSQLiteDatabase<typeof schema>;

export type DatabaseClient = {
  sqlite: SqliteClient;
  db: DbClient;
};

export function createDb(databasePath: string): DatabaseClient {
  mkdirSync(dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath, { create: true });
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
  };
}
