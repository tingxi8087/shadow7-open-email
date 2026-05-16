import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../auth/password";
import { loadConfig } from "../config/env";
import {
  createSessionExpiry,
  createSessionToken,
  hashSessionToken,
  sessionCookieName,
  sessionMaxAgeSeconds,
} from "../auth/session";
import { createAdmin, getAdmin, hasAdmin } from "../repositories/admin";
import { createSession } from "../repositories/session";

type SetupBody = {
  email?: string;
  password?: string;
  displayName?: string;
};

function publicAdmin(admin: Awaited<ReturnType<typeof getAdmin>>) {
  if (!admin) {
    return null;
  }

  return {
    email: admin.email,
    displayName: admin.displayName,
    lastLoginAt: admin.lastLoginAt,
  };
}

export const setupRoutes: FastifyPluginAsync = async (app) => {
  const config = loadConfig();

  app.get("/setup/state", async () => {
    return {
      initialized: await hasAdmin(app.db),
    };
  });

  app.post<{ Body: SetupBody }>("/setup/admin", async (request, reply) => {
    if (await hasAdmin(app.db)) {
      return reply.code(409).send({
        code: "already_initialized",
        message: "管理员账号已经创建。",
      });
    }

    const email = request.body.email?.trim().toLowerCase();
    const password = request.body.password ?? "";
    const displayName = request.body.displayName?.trim();

    if (!email || !email.includes("@")) {
      return reply.code(400).send({
        code: "invalid_email",
        message: "请输入有效邮箱。",
      });
    }

    if (password.length < 8) {
      return reply.code(400).send({
        code: "weak_password",
        message: "密码至少需要 8 位。",
      });
    }

    const admin = await createAdmin(app.db, {
      email,
      passwordHash: await hashPassword(password),
      displayName,
    });
    const token = createSessionToken();

    await createSession(app.db, {
      id: randomUUID(),
      tokenHash: hashSessionToken(token),
      expiresAt: createSessionExpiry(),
    });

    reply.setCookie(sessionCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookie.secure,
      path: "/",
      maxAge: sessionMaxAgeSeconds,
    });

    return {
      ok: true,
      admin: publicAdmin(admin),
    };
  });
};
