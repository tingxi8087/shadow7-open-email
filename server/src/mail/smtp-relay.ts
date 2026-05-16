import nodemailer from "nodemailer";
import { buildMimeMessage, type OutboundMailInput } from "./mime";
import type { RelayConfig } from "./outbound-settings";

export async function sendViaSmtpRelay(input: OutboundMailInput, relay: RelayConfig) {
  const transporter = nodemailer.createTransport({
    host: relay.host,
    port: relay.port,
    secure: relay.secure,
    auth: {
      user: relay.user,
      pass: relay.pass,
    },
  });
  const rawMessage = buildMimeMessage(input);

  await transporter.sendMail({
    envelope: {
      from: input.from,
      to: [...input.to, ...(input.cc ?? []), ...(input.bcc ?? [])],
    },
    raw: rawMessage,
  });

  return rawMessage;
}
