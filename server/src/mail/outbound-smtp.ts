import { resolveMx } from "node:dns/promises";
import net from "node:net";
import { signDkim } from "./dkim";
import { buildMimeMessage, normalizeEmail, type OutboundMailInput } from "./mime";

type RecipientGroup = {
  domain: string;
  recipients: string[];
};

const smtpTimeoutMs = 20_000;

function emailDomain(email: string) {
  const normalized = normalizeEmail(email);
  const parts = normalized.split("@");

  return parts.length === 2 && parts[0] && parts[1] ? parts[1] : null;
}

function groupRecipients(recipients: string[]) {
  const groups = new Map<string, string[]>();

  for (const recipient of recipients.map(normalizeEmail)) {
    const domain = emailDomain(recipient);
    if (!domain) {
      throw new Error(`Invalid recipient: ${recipient}`);
    }

    groups.set(domain, [...(groups.get(domain) ?? []), recipient]);
  }

  return Array.from(groups, ([domain, groupRecipients]) => ({
    domain,
    recipients: groupRecipients,
  }));
}

function dotStuff(message: string) {
  return message.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

async function resolveTargetMx(domain: string) {
  const records = await resolveMx(domain);
  const sorted = records.sort((a, b) => a.priority - b.priority);
  const exchange = sorted[0]?.exchange;

  if (!exchange) {
    throw new Error(`No MX record found for ${domain}`);
  }

  return exchange;
}

async function deliverToMx(group: RecipientGroup, input: OutboundMailInput, rawMessage: string) {
  const mxHost = await resolveTargetMx(group.domain);
  const socket = net.connect(25, mxHost);
  socket.setEncoding("utf8");
  socket.setTimeout(smtpTimeoutMs);

  let buffer = "";

  const close = () => {
    socket.removeAllListeners();
    socket.destroy();
  };

  const readResponse = () =>
    new Promise<string>((resolve, reject) => {
      const cleanup = () => {
        socket.off("data", onData);
        socket.off("error", onError);
        socket.off("timeout", onTimeout);
      };
      const onData = (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/).filter(Boolean);
        const lastLine = lines.at(-1);

        if (lastLine && /^\d{3} /.test(lastLine)) {
          const response = buffer.trimEnd();
          buffer = "";
          cleanup();
          resolve(response);
        }
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onTimeout = () => {
        cleanup();
        reject(new Error(`SMTP timeout connecting to ${mxHost}`));
      };

      socket.on("data", onData);
      socket.once("error", onError);
      socket.once("timeout", onTimeout);
    });

  const assertCode = async (expected: number | number[], command?: string) => {
    if (command) {
      socket.write(`${command}\r\n`);
    }

    const response = await readResponse();
    const code = Number(response.slice(0, 3));
    const acceptedCodes = Array.isArray(expected) ? expected : [expected];

    if (!acceptedCodes.includes(code)) {
      throw new Error(`SMTP ${mxHost} rejected ${command ?? "connection"}: ${response}`);
    }

    return response;
  };

  try {
    await assertCode(220);
    await assertCode(250, `EHLO ${input.domain}`);
    await assertCode(250, `MAIL FROM:<${normalizeEmail(input.from)}>`);

    for (const recipient of group.recipients) {
      await assertCode([250, 251], `RCPT TO:<${recipient}>`);
    }

    await assertCode(354, "DATA");
    socket.write(`${dotStuff(rawMessage)}\r\n.\r\n`);
    await assertCode(250);
    socket.write("QUIT\r\n");
  } finally {
    close();
  }
}

export async function sendOutboundMail(input: OutboundMailInput) {
  const allRecipients = [...input.to, ...(input.cc ?? []), ...(input.bcc ?? [])];
  const groups = groupRecipients(allRecipients);
  const unsignedMessage = buildMimeMessage(input);
  const rawMessage = input.dkimPrivateKey
    ? signDkim(unsignedMessage, {
        domain: input.domain,
        privateKey: input.dkimPrivateKey,
      })
    : unsignedMessage;

  for (const group of groups) {
    await deliverToMx(group, input, rawMessage);
  }

  return rawMessage;
}
