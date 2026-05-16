import { rmSync } from "node:fs";
import { createDb } from "../db/client";
import { migrate } from "../db/migrate";

const databasePath = "/tmp/shadow7-mail-schema-verify.sqlite";

rmSync(databasePath, { force: true });
rmSync(`${databasePath}-shm`, { force: true });
rmSync(`${databasePath}-wal`, { force: true });

const { sqlite } = createDb(databasePath);
migrate(sqlite);

const tables = sqlite
  .query(
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  )
  .all() as Array<{ name: string }>;

for (const table of tables) {
  const columns = sqlite.query(`PRAGMA table_info(${table.name})`).all() as Array<{
    name: string;
    type: string;
    notnull: number;
    pk: number;
  }>;

  console.log(
    `${table.name}: ${columns
      .map((column) => `${column.name}:${column.type}${column.pk ? ":pk" : ""}`)
      .join(", ")}`,
  );
}

sqlite.close();
