export type OutboundMailInput = {
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  messageId: string;
  domain: string;
  dkimPrivateKey?: string;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function formatDate(date = new Date()) {
  return date.toUTCString().replace("GMT", "+0000");
}

export function encodeHeader(value: string) {
  if (/^[\x20-\x7e]*$/.test(value)) {
    return value;
  }

  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function formatAddress(email: string, displayName?: string) {
  const normalizedEmail = normalizeEmail(email);
  const name = sanitizeHeader(displayName ?? "");

  return name ? `${encodeHeader(name)} <${normalizedEmail}>` : `<${normalizedEmail}>`;
}

export function buildMimeMessage(input: OutboundMailInput) {
  const cc = input.cc?.length ? input.cc.map(normalizeEmail).join(", ") : null;
  const headers = [
    `Message-ID: ${input.messageId}`,
    `Date: ${formatDate()}`,
    `From: ${formatAddress(input.from, input.fromName)}`,
    `To: ${input.to.map(normalizeEmail).join(", ")}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${encodeHeader(sanitizeHeader(input.subject))}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
  ].filter(Boolean);

  const body = input.textBody.replace(/\r?\n/g, "\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${body}\r\n`;
}
