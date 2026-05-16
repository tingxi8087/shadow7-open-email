import { resolve4, resolveMx, resolveTxt } from "node:dns/promises";
import type { FastifyPluginAsync } from "fastify";
import { loadConfig } from "../config/env";
import { dkimPublicKeyValue, dkimSelector, ensureDkimKeys } from "../mail/dkim";
import { getOutboundSettings } from "../mail/outbound-settings";
import { getPrimaryDomain, getSetting, setSetting } from "../mail/repository";
import { getMessageCounts } from "../repositories/messages";

type DnsStatus = "ok" | "pending" | "not_configured";

type PreferencesBody = {
  senderDisplayName?: string;
};

function sanitizeDisplayName(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 80);
}

async function checkDnsSummary(input: { domain: string | null; mailHost: string | null; publicHost: string | null; db: Parameters<typeof getPrimaryDomain>[0] }) {
  if (!input.domain || !input.mailHost || !input.publicHost) {
    return {
      status: "not_configured" as DnsStatus,
      verified: 0,
      total: 5,
    };
  }

  const checks = await Promise.all([
    resolveMx(input.domain)
      .then((records) => records.some((record) => record.exchange.replace(/\.$/, "") === input.mailHost))
      .catch(() => false),
    resolve4(input.mailHost)
      .then((addresses) => addresses.includes(input.publicHost ?? ""))
      .catch(() => false),
    resolveTxt(input.domain)
      .then((records) => records.map((parts) => parts.join("")).join(" | "))
      .then((txt) => txt.includes("v=spf1") && txt.includes(`ip4:${input.publicHost}`))
      .catch(() => false),
    ensureDkimKeys(input.db)
      .then(({ publicKey }) =>
        resolveTxt(`${dkimSelector}._domainkey.${input.domain}`).then((records) => ({
          txt: records.map((parts) => parts.join("")).join(""),
          expectedKey: dkimPublicKeyValue(publicKey),
        })),
      )
      .then(({ txt, expectedKey }) => txt.includes("v=DKIM1") && txt.includes(expectedKey))
      .catch(() => false),
    resolveTxt(`_dmarc.${input.domain}`)
      .then((records) => records.map((parts) => parts.join("")).join(" | "))
      .then((txt) => txt.includes("v=DMARC1"))
      .catch(() => false),
  ]);
  const verified = checks.filter(Boolean).length;

  return {
    status: verified === checks.length ? ("ok" as DnsStatus) : ("pending" as DnsStatus),
    verified,
    total: checks.length,
  };
}

export const systemRoutes: FastifyPluginAsync = async (app) => {
  app.get("/system/status", async () => {
    const config = loadConfig();
    const counts = await getMessageCounts(app.db);
    const primaryDomain = await getPrimaryDomain(app.db);
    const mailHost = primaryDomain ? (await getSetting(app.db, "mail_host")) || `mail.${primaryDomain}` : null;
    const publicHost = await getSetting(app.db, "public_host");
    const senderDisplayName = await getSetting(app.db, "sender_display_name");
    const outbound = await getOutboundSettings(app.db);
    const dns = await checkDnsSummary({
      db: app.db,
      domain: primaryDomain,
      mailHost,
      publicHost,
    });
    const outboundStatus =
      outbound.mode === "direct" || (outbound.relay.host && outbound.relay.user && outbound.relay.hasPassword) ? "configured" : "incomplete";

    return {
      gateway: config.smtpInbound.enabled ? "online" : "offline",
      dns: dns.status,
      dnsVerified: dns.verified,
      dnsTotal: dns.total,
      primaryDomain,
      mailHost,
      publicHost,
      smtpInboundEnabled: config.smtpInbound.enabled,
      outboundMode: outbound.mode,
      outboundStatus,
      senderDisplayName: senderDisplayName ?? "",
      unreadCount: counts.unread,
    };
  });

  app.get("/system/preferences", async () => {
    return {
      senderDisplayName: (await getSetting(app.db, "sender_display_name")) ?? "",
    };
  });

  app.put<{ Body: PreferencesBody }>("/system/preferences", async (request) => {
    const senderDisplayName = sanitizeDisplayName(request.body.senderDisplayName ?? "");
    await setSetting(app.db, "sender_display_name", senderDisplayName);

    return {
      ok: true,
      senderDisplayName,
    };
  });
};
