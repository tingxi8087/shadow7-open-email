import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "../auth/password";
import { loadConfig } from "../config/env";
import {
  createSessionExpiry,
  createSessionToken,
  hashSessionToken,
  sessionCookieName,
  sessionMaxAgeSeconds,
} from "../auth/session";
import { getAdmin, touchAdminLogin, updateAdminPassword } from "../repositories/admin";
import { createSession, deleteExpiredSessions, deleteOtherSessions, deleteSessionByHash } from "../repositories/session";

type LoginBody = {
  email?: string;
  password?: string;
};

type ChangePasswordBody = {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
};

function publicAdmin(admin: NonNullable<Awaited<ReturnType<typeof getAdmin>>>) {
  return {
    email: admin.email,
    displayName: admin.displayName,
    lastLoginAt: admin.lastLoginAt,
  };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const config = loadConfig();

  app.post<{ Body: LoginBody }>("/auth/login", async (request, reply) => {
    await deleteExpiredSessions(app.db);

    const admin = await getAdmin(app.db);
    if (!admin) {
      return reply.code(409).send({
        code: "setup_required",
        message: "请先创建管理员账号。",
      });
    }

    const email = request.body.email?.trim().toLowerCase();
    const password = request.body.password ?? "";
    const passwordOk = await verifyPassword(password, admin.passwordHash);

    if (email !== admin.email.toLowerCase() || !passwordOk) {
      return reply.code(401).send({
        code: "invalid_credentials",
        message: "邮箱或密码不正确。",
      });
    }

    const token = createSessionToken();
    await createSession(app.db, {
      id: randomUUID(),
      tokenHash: hashSessionToken(token),
      expiresAt: createSessionExpiry(),
    });
    await touchAdminLogin(app.db);

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

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies[sessionCookieName];
    if (token) {
      await deleteSessionByHash(app.db, hashSessionToken(token));
    }

    reply.clearCookie(sessionCookieName, {
      path: "/",
    });

    return {
      ok: true,
    };
  });

  app.get("/auth/me", async (request, reply) => {
    const admin = await getAdmin(app.db);
    if (!admin) {
      return reply.code(409).send({
        code: "setup_required",
        message: "请先创建管理员账号。",
      });
    }

    return {
      ok: true,
      admin: publicAdmin(admin),
    };
  });

  app.post<{ Body: ChangePasswordBody }>("/auth/change-password", async (request, reply) => {
    const admin = await getAdmin(app.db);
    if (!admin) {
      return reply.code(409).send({
        code: "setup_required",
        message: "请先创建管理员账号。",
      });
    }

    const currentPassword = request.body.currentPassword ?? "";
    const newPassword = request.body.newPassword ?? "";
    const confirmPassword = request.body.confirmPassword ?? "";

    if (!(await verifyPassword(currentPassword, admin.passwordHash))) {
      return reply.code(400).send({
        code: "invalid_current_password",
        message: "当前密码不正确。",
      });
    }
    if (newPassword.length < 10) {
      return reply.code(400).send({
        code: "weak_password",
        message: "新密码至少需要 10 位。",
      });
    }
    if (newPassword !== confirmPassword) {
      return reply.code(400).send({
        code: "password_mismatch",
        message: "两次输入的新密码不一致。",
      });
    }
    if (newPassword === currentPassword) {
      return reply.code(400).send({
        code: "password_reused",
        message: "新密码不能与当前密码相同。",
      });
    }

    await updateAdminPassword(app.db, await hashPassword(newPassword));
    if (request.sessionId) {
      await deleteOtherSessions(app.db, request.sessionId);
    }

    return {
      ok: true,
    };
  });
};
