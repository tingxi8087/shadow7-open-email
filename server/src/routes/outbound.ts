import type { FastifyPluginAsync } from "fastify";
import { getRelayConfig, getOutboundSettings, saveOutboundSettings, type OutboundMode } from "../mail/outbound-settings";
import { sendViaSmtpRelay } from "../mail/smtp-relay";
import { getPrimaryDomain } from "../mail/repository";

type SettingsBody = {
  mode?: OutboundMode;
  relay?: {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
  };
};

type TestBody = SettingsBody & {
  to?: string;
  fromLocalPart?: string;
};

function isMode(value: unknown): value is OutboundMode {
  return value === "direct" || value === "smtp";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidLocalPart(value: string) {
  return /^[a-z0-9._-]{1,64}$/i.test(value) && !value.startsWith(".") && !value.endsWith(".");
}

function validateRelay(input: SettingsBody["relay"]) {
  if (!input) {
    return "请填写 SMTP Relay 配置。";
  }
  if (!input.host?.trim()) {
    return "请填写 SMTP Host。";
  }
  if (!Number.isInteger(input.port) || Number(input.port) <= 0) {
    return "请填写有效 SMTP 端口。";
  }
  if (!input.user?.trim()) {
    return "请填写 SMTP 用户名。";
  }

  return null;
}

export const outboundRoutes: FastifyPluginAsync = async (app) => {
  app.get("/outbound/settings", async () => {
    return getOutboundSettings(app.db);
  });

  app.put<{ Body: SettingsBody }>("/outbound/settings", async (request, reply) => {
    const mode = request.body.mode;

    if (!isMode(mode)) {
      return reply.code(400).send({
        code: "invalid_mode",
        message: "发件方式无效。",
      });
    }

    if (mode === "smtp") {
      const error = validateRelay(request.body.relay);
      if (error) {
        return reply.code(400).send({
          code: "invalid_relay",
          message: error,
        });
      }
    }

    await saveOutboundSettings(app.db, {
      mode,
      relay: request.body.relay,
    });

    return getOutboundSettings(app.db);
  });

  app.post<{ Body: TestBody }>("/outbound/test", async (request, reply) => {
    const primaryDomain = await getPrimaryDomain(app.db);

    if (!primaryDomain) {
      return reply.code(409).send({
        code: "domain_not_configured",
        message: "请先配置主域名。",
      });
    }

    const to = request.body.to?.trim().toLowerCase() ?? "";
    const fromLocalPart = (request.body.fromLocalPart?.trim() || "admin").toLowerCase();

    if (!isEmail(to)) {
      return reply.code(400).send({
        code: "invalid_recipient",
        message: "请输入有效测试收件人。",
      });
    }
    if (!isValidLocalPart(fromLocalPart)) {
      return reply.code(400).send({
        code: "invalid_sender",
        message: "发件人格式无效。",
      });
    }

    if (request.body.mode && !isMode(request.body.mode)) {
      return reply.code(400).send({
        code: "invalid_mode",
        message: "发件方式无效。",
      });
    }

    if (request.body.mode) {
      await saveOutboundSettings(app.db, {
        mode: request.body.mode,
        relay: request.body.relay,
      });
    }

    const relay = await getRelayConfig(app.db);
    if (!relay) {
      return reply.code(400).send({
        code: "relay_not_configured",
        message: "SMTP Relay 尚未配置完整。",
      });
    }

    try {
      await sendViaSmtpRelay(
        {
          from: `${fromLocalPart}@${primaryDomain}`,
          to: [to],
          subject: "Shadow7 Mail SMTP Relay Test",
          textBody: "这是一封来自 Shadow7 Mail 的 SMTP Relay 测试邮件。",
          messageId: `<relay-test-${crypto.randomUUID()}@${primaryDomain}>`,
          domain: primaryDomain,
        },
        relay,
      );
    } catch (error) {
      request.log.warn({ error }, "SMTP relay test failed");
      return reply.code(502).send({
        code: "relay_test_failed",
        message: error instanceof Error ? error.message : "SMTP Relay 测试失败。",
      });
    }

    return {
      ok: true,
    };
  });
};
