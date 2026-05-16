import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    const row = app.sqlite.query("SELECT datetime('now') AS now").get() as { now: string };

    return {
      ok: true,
      service: "shadow7-mail-server",
      database: "ok",
      time: row.now,
    };
  });
};
