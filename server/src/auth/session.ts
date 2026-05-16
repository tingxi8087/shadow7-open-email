import { createHash, randomBytes } from "node:crypto";

export const sessionCookieName = "shadow7_session";
export const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionExpiry() {
  return new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString();
}
