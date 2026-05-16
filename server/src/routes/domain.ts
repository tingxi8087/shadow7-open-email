import { resolve4, resolveMx, resolveTxt } from "node:dns/promises";
import type { FastifyPluginAsync } from "fastify";
import type { DbClient } from "../db/client";
import { dkimPublicKeyValue, dkimSelector, ensureDkimKeys, getDkimDnsRecord, rotateDkimKeys } from "../mail/dkim";
import { getPrimaryDomain, getSetting, setSetting } from "../mail/repository";
import { loadConfig } from "../config/env";

type DomainSettingsBody = {
  primaryDomain?: string;
  publicHost?: string;
};

type DnsStatus = "verified" | "pending" | "missing" | "mismatch";

const domainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const ipv4Pattern =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function isValidDomain(value: string) {
  return domainPattern.test(value);
}

function defaultMailHost(domain: string) {
  return `mail.${domain}`;
}

function normalizePublicHost(value: string) {
  return value.trim();
}

function isValidPublicHost(value: string) {
  return ipv4Pattern.test(value);
}

async function getPublicHost(appDb: DbClient) {
  return (await getSetting(appDb, "public_host")) || loadConfig().publicHost;
}

function relativeHost(host: string, domain: string) {
  if (host === domain) {
    return "@";
  }
  return host.endsWith(`.${domain}`) ? host.slice(0, -domain.length - 1) : host;
}

function record(type: string, host: string, value: string, ttl = "Auto", priority?: number) {
  return {
    type,
    host,
    value,
    ttl,
    priority,
  };
}

async function buildRecords(appDb: DbClient) {
  const domain = await getPrimaryDomain(appDb);
  const publicHost = await getPublicHost(appDb);

  if (!domain) {
    return {
      primaryDomain: null,
      mailHost: null,
      publicHost,
      records: [],
    };
  }

  const mailHost = (await getSetting(appDb, "mail_host")) || defaultMailHost(domain);
  const dkim = await getDkimDnsRecord(appDb, domain);
  const records = [
    record("A", relativeHost(mailHost, domain), publicHost),
    record("MX", "@", mailHost, "Auto", 10),
    record("TXT", "@", `v=spf1 ip4:${publicHost} mx -all`),
    record("TXT", relativeHost(dkim.host, domain), dkim.value),
    record("TXT", "_dmarc", `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`),
  ];

  return {
    primaryDomain: domain,
    mailHost,
    publicHost,
    records,
  };
}

function okCheck(key: string, label: string, expected: string, actual: string, status: DnsStatus) {
  return {
    key,
    label,
    expected,
    actual,
    status,
  };
}

export const domainRoutes: FastifyPluginAsync = async (app) => {
  app.get("/domain/settings", async () => {
    const domain = await getPrimaryDomain(app.db);
    const mailHost = domain ? (await getSetting(app.db, "mail_host")) || defaultMailHost(domain) : null;

    return {
      primaryDomain: domain,
      mailHost,
      publicHost: await getPublicHost(app.db),
    };
  });

  app.put<{ Body: DomainSettingsBody }>("/domain/settings", async (request, reply) => {
    const primaryDomain = normalizeDomain(request.body.primaryDomain ?? "");
    const mailHost = defaultMailHost(primaryDomain);
    const publicHost = normalizePublicHost(request.body.publicHost ?? "");

    if (!isValidDomain(primaryDomain)) {
      return reply.code(400).send({
        code: "invalid_domain",
        message: "请输入有效主域名。",
      });
    }
    if (!isValidPublicHost(publicHost)) {
      return reply.code(400).send({
        code: "invalid_public_host",
        message: "请输入有效服务器公网 IPv4 地址。",
      });
    }

    await setSetting(app.db, "primary_domain", primaryDomain);
    await setSetting(app.db, "mail_host", mailHost);
    await setSetting(app.db, "public_host", publicHost);
    await ensureDkimKeys(app.db);

    return {
      primaryDomain,
      mailHost,
      publicHost,
    };
  });

  app.get("/dns/records", async () => buildRecords(app.db));

  app.get("/dns/check", async () => {
    const domain = await getPrimaryDomain(app.db);
    const publicHost = await getPublicHost(app.db);

    if (!domain) {
      return {
        checks: [],
      };
    }

    const mailHost = (await getSetting(app.db, "mail_host")) || defaultMailHost(domain);
    const checks = [];

    try {
      const mx = await resolveMx(domain);
      const actual = mx.map((item) => `${item.priority} ${item.exchange.replace(/\.$/, "")}`).join(", ");
      const matched = mx.some((item) => item.exchange.replace(/\.$/, "") === mailHost);
      checks.push(okCheck("mx", "MX", `10 ${mailHost}`, actual || "未查询到 MX", matched ? "verified" : "mismatch"));
    } catch {
      checks.push(okCheck("mx", "MX", `10 ${mailHost}`, "未查询到 MX", "missing"));
    }

    try {
      const addresses = await resolve4(mailHost);
      const actual = addresses.join(", ");
      const matched = addresses.includes(publicHost);
      checks.push(okCheck("a", "A", publicHost, actual || "未查询到 A", matched ? "verified" : "mismatch"));
    } catch {
      checks.push(okCheck("a", "A", publicHost, "未查询到 A", "missing"));
    }

    try {
      const txt = (await resolveTxt(domain)).map((parts) => parts.join("")).join(" | ");
      const matched = txt.includes("v=spf1") && txt.includes(`ip4:${publicHost}`);
      checks.push(okCheck("spf", "SPF", `v=spf1 ip4:${publicHost} mx -all`, txt || "未查询到 TXT", matched ? "verified" : "mismatch"));
    } catch {
      checks.push(okCheck("spf", "SPF", `v=spf1 ip4:${publicHost} mx -all`, "未查询到 TXT", "missing"));
    }

    try {
      const { publicKey } = await ensureDkimKeys(app.db);
      const expectedKey = dkimPublicKeyValue(publicKey);
      const dkimHost = `${dkimSelector}._domainkey.${domain}`;
      const txt = (await resolveTxt(dkimHost)).map((parts) => parts.join("")).join("");
      const status: DnsStatus = txt.includes("v=DKIM1") && txt.includes(expectedKey) ? "verified" : txt ? "mismatch" : "missing";
      checks.push(okCheck("dkim", "DKIM", `v=DKIM1; k=rsa; p=${expectedKey}`, txt || "未查询到 DKIM", status));
    } catch {
      checks.push(okCheck("dkim", "DKIM", `${dkimSelector}._domainkey.${domain}`, "未查询到 DKIM", "missing"));
    }

    try {
      const dmarcHost = `_dmarc.${domain}`;
      const txt = (await resolveTxt(dmarcHost)).map((parts) => parts.join("")).join(" | ");
      checks.push(okCheck("dmarc", "DMARC", "v=DMARC1 ...", txt || "未查询到 DMARC", txt.includes("v=DMARC1") ? "verified" : "missing"));
    } catch {
      checks.push(okCheck("dmarc", "DMARC", "v=DMARC1 ...", "未查询到 DMARC", "missing"));
    }

    return {
      checks,
    };
  });

  app.post("/dns/dkim/rotate", async () => {
    const domain = await getPrimaryDomain(app.db);
    await rotateDkimKeys(app.db);

    return domain ? buildRecords(app.db) : { primaryDomain: null, records: [] };
  });
};
