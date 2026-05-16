import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { hashSessionToken, sessionCookieName } from "../auth/session";
import { deleteSessionByHash, getSessionByHash, touchSession } from "../repositories/session";

declare module "fastify" {
  interface FastifyRequest {
    sessionId?: string;
  }
}

const publicRoutes = new Set([
  "GET /api/setup/state",
  "POST /api/setup/admin",
  "POST /api/auth/login",
]);

function routeKey(request: FastifyRequest) {
  return `${request.method} ${request.url.split("?")[0]}`;
}

const authPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) {
      return;
    }

    if (publicRoutes.has(routeKey(request))) {
      return;
    }

    const token = request.cookies[sessionCookieName];
    if (!token) {
      await reply.code(401).send({
        code: "unauthorized",
        message: "未登录。",
      });
      return reply;
    }

    const tokenHash = hashSessionToken(token);
    const session = await getSessionByHash(app.db, tokenHash);

    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      if (session) {
        await deleteSessionByHash(app.db, tokenHash);
      }

      await reply.code(401).send({
        code: "unauthorized",
        message: "登录已过期。",
      });
      return reply;
    }

    request.sessionId = session.id;
    await touchSession(app.db, session.id);
  });
};

export default fp(authPlugin, {
  name: "auth",
});
