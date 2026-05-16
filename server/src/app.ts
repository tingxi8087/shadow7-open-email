import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { loadConfig } from "./config/env";
import { InboundSmtpService } from "./mail/inbound-smtp";
import authPlugin from "./plugins/auth";
import databasePlugin from "./plugins/database";
import { authRoutes } from "./routes/auth";
import { domainRoutes } from "./routes/domain";
import { healthRoutes } from "./routes/health";
import { messageRoutes } from "./routes/messages";
import { outboundRoutes } from "./routes/outbound";
import { setupRoutes } from "./routes/setup";
import { systemRoutes } from "./routes/system";

export async function createApp() {
  const config = loadConfig();
  const app = Fastify({
    logger: {
      level: Bun.env.LOG_LEVEL ?? "info",
    },
  });

  await app.register(cors, {
    credentials: true,
    origin: true,
  });
  await app.register(cookie);
  await app.register(databasePlugin, {
    databasePath: config.databasePath,
  });
  await app.register(authPlugin);
  await app.register(healthRoutes);
  await app.register(setupRoutes, {
    prefix: "/api",
  });
  await app.register(authRoutes, {
    prefix: "/api",
  });
  await app.register(messageRoutes, {
    prefix: "/api",
  });
  await app.register(systemRoutes, {
    prefix: "/api",
  });
  await app.register(outboundRoutes, {
    prefix: "/api",
  });
  await app.register(domainRoutes, {
    prefix: "/api",
  });

  if (existsSync(config.webDistPath)) {
    await app.register(fastifyStatic, {
      root: config.webDistPath,
      prefix: "/",
      index: "index.html",
      wildcard: false,
    });

    app.get("/*", async (request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({
          code: "not_found",
          message: "接口不存在。",
        });
      }

      return reply.sendFile("index.html", config.webDistPath);
    });
  } else {
    app.log.warn({ webDistPath: config.webDistPath }, "Web dist directory not found; static UI disabled");
  }

  const inboundSmtp = new InboundSmtpService({
    db: app.db,
    config: config.smtpInbound,
    logger: app.log,
  });
  await inboundSmtp.start();
  app.addHook("onClose", async () => {
    await inboundSmtp.stop();
  });

  return { app, config };
}
