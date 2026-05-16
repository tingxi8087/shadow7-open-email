import type { DbClient } from "../db/client";
import { getSetting, setSetting } from "./repository";

export type OutboundMode = "direct" | "smtp";

export type OutboundSettings = {
  mode: OutboundMode;
  relay: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    hasPassword: boolean;
  };
};

export type RelayConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

const keys = {
  mode: "outbound_mode",
  host: "smtp_relay_host",
  port: "smtp_relay_port",
  secure: "smtp_relay_secure",
  user: "smtp_relay_user",
  pass: "smtp_relay_pass",
};

function parseMode(value: string | null): OutboundMode {
  return value === "smtp" ? "smtp" : "direct";
}

function parsePort(value: string | null) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : 465;
}

function parseSecure(value: string | null) {
  return value !== "false";
}

export async function getOutboundSettings(db: DbClient): Promise<OutboundSettings> {
  const [mode, host, port, secure, user, pass] = await Promise.all([
    getSetting(db, keys.mode),
    getSetting(db, keys.host),
    getSetting(db, keys.port),
    getSetting(db, keys.secure),
    getSetting(db, keys.user),
    getSetting(db, keys.pass),
  ]);

  return {
    mode: parseMode(mode),
    relay: {
      host: host ?? "",
      port: parsePort(port),
      secure: parseSecure(secure),
      user: user ?? "",
      hasPassword: Boolean(pass),
    },
  };
}

export async function getRelayConfig(db: DbClient): Promise<RelayConfig | null> {
  const [host, port, secure, user, pass] = await Promise.all([
    getSetting(db, keys.host),
    getSetting(db, keys.port),
    getSetting(db, keys.secure),
    getSetting(db, keys.user),
    getSetting(db, keys.pass),
  ]);

  if (!host || !user || !pass) {
    return null;
  }

  return {
    host,
    port: parsePort(port),
    secure: parseSecure(secure),
    user,
    pass,
  };
}

export async function saveOutboundSettings(
  db: DbClient,
  input: {
    mode: OutboundMode;
    relay?: {
      host?: string;
      port?: number;
      secure?: boolean;
      user?: string;
      pass?: string;
    };
  },
) {
  await setSetting(db, keys.mode, input.mode);

  if (!input.relay) {
    return;
  }

  const writes: Array<Promise<void>> = [];

  if (typeof input.relay.host === "string") {
    writes.push(setSetting(db, keys.host, input.relay.host.trim()));
  }
  if (typeof input.relay.port === "number") {
    writes.push(setSetting(db, keys.port, String(input.relay.port)));
  }
  if (typeof input.relay.secure === "boolean") {
    writes.push(setSetting(db, keys.secure, String(input.relay.secure)));
  }
  if (typeof input.relay.user === "string") {
    writes.push(setSetting(db, keys.user, input.relay.user.trim()));
  }
  if (typeof input.relay.pass === "string" && input.relay.pass.length > 0) {
    writes.push(setSetting(db, keys.pass, input.relay.pass));
  }

  await Promise.all(writes);
}
