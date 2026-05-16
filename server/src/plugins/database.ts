import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { createDb, type DatabaseClient, type DbClient, type SqliteClient } from "../db/client";
import { migrate } from "../db/migrate";

declare module "fastify" {
  interface FastifyInstance {
    db: DbClient;
    sqlite: SqliteClient;
  }
}

type DatabasePluginOptions = {
  databasePath: string;
};

const databasePlugin: FastifyPluginAsync<DatabasePluginOptions> = async (app, options) => {
  const database: DatabaseClient = createDb(options.databasePath);
  migrate(database.sqlite);

  app.decorate("db", database.db);
  app.decorate("sqlite", database.sqlite);
  app.addHook("onClose", async () => {
    database.sqlite.close();
  });
};

export default fp(databasePlugin, {
  name: "database",
});
