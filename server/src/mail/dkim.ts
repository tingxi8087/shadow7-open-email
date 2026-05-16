import { generateKeyPairSync } from "node:crypto";
import { DKIMSign } from "dkim-signer";
import type { DbClient } from "../db/client";
import { getSetting, setSetting } from "./repository";

export const dkimSelector = "default";

const privateKeySetting = "dkim_private_key";
const publicKeySetting = "dkim_public_key";

type DkimKeyPair = {
  privateKey: string;
  publicKey: string;
};

function publicKeyToDnsValue(publicKey: string) {
  return publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r?\n/g, "\r\n");
}

export async function ensureDkimKeys(db: DbClient): Promise<DkimKeyPair> {
  const existingPrivateKey = await getSetting(db, privateKeySetting);
  const existingPublicKey = await getSetting(db, publicKeySetting);

  if (existingPrivateKey && existingPublicKey) {
    return {
      privateKey: existingPrivateKey,
      publicKey: existingPublicKey,
    };
  }

  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
  });

  await setSetting(db, privateKeySetting, privateKey);
  await setSetting(db, publicKeySetting, publicKey);

  return {
    privateKey,
    publicKey,
  };
}

export async function rotateDkimKeys(db: DbClient): Promise<DkimKeyPair> {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
  });

  await setSetting(db, privateKeySetting, privateKey);
  await setSetting(db, publicKeySetting, publicKey);

  return {
    privateKey,
    publicKey,
  };
}

export function dkimPublicKeyValue(publicKey: string) {
  return publicKeyToDnsValue(publicKey);
}

export async function getDkimDnsRecord(db: DbClient, domain: string) {
  const { publicKey } = await ensureDkimKeys(db);

  return {
    type: "TXT",
    host: `${dkimSelector}._domainkey.${domain}`,
    value: `v=DKIM1; k=rsa; p=${publicKeyToDnsValue(publicKey)}`,
  };
}

export function signDkim(rawMessage: string, input: { domain: string; privateKey: string }) {
  const normalizedMessage = normalizeLineEndings(rawMessage);
  const signature = DKIMSign(normalizedMessage, {
    domainName: input.domain,
    keySelector: dkimSelector,
    privateKey: input.privateKey,
    headerFieldNames:
      "From:To:Cc:Subject:Date:Message-ID:MIME-Version:Content-Type:Content-Transfer-Encoding",
  });

  return `${signature}\r\n${normalizedMessage}`;
}
