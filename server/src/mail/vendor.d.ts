declare module "smtp-server" {
  import type { Server } from "node:net";
  import type { Readable } from "node:stream";

  export type SMTPAddress = {
    address: string;
    args?: Record<string, string | boolean>;
  };

  export type SMTPSession = {
    id: string;
    envelope: {
      mailFrom?: SMTPAddress;
      rcptTo: SMTPAddress[];
    };
    remoteAddress?: string;
    clientHostname?: string;
  };

  export type SMTPServerError = Error & {
    responseCode?: number;
  };

  export type SMTPServerOptions = {
    name?: string;
    banner?: string;
    authOptional?: boolean;
    disabledCommands?: string[];
    size?: number;
    closeTimeout?: number;
    logger?: boolean;
    onRcptTo?: (
      address: SMTPAddress,
      session: SMTPSession,
      callback: (error?: SMTPServerError | Error | null) => void,
    ) => void;
    onData?: (
      stream: Readable & { sizeExceeded?: boolean },
      session: SMTPSession,
      callback: (error?: SMTPServerError | Error | null, message?: string) => void,
    ) => void;
  };

  export class SMTPServer {
    server: Server;
    constructor(options?: SMTPServerOptions);
    listen(port: number, host: string, callback?: () => void): Server;
    close(callback?: (error?: Error) => void): void;
    on(event: "error", listener: (error: Error) => void): this;
    once(event: "error", listener: (error: Error) => void): this;
    off(event: "error", listener: (error: Error) => void): this;
  }
}

declare module "mailparser" {
  import type { Readable } from "node:stream";

  export type ParsedMailAddress = {
    address?: string;
    name?: string;
  };

  export type ParsedMailAddressObject = {
    value?: ParsedMailAddress[];
    html?: string;
    text?: string;
  };

  export type ParsedMailAttachment = {
    filename?: string;
    contentType?: string;
    size?: number;
    content: Buffer;
  };

  export type ParsedMail = {
    messageId?: string;
    from?: ParsedMailAddressObject;
    to?: ParsedMailAddressObject | ParsedMailAddressObject[];
    cc?: ParsedMailAddressObject | ParsedMailAddressObject[];
    bcc?: ParsedMailAddressObject | ParsedMailAddressObject[];
    subject?: string;
    text?: string;
    html?: string | false;
    date?: Date;
    attachments?: ParsedMailAttachment[];
  };

  export function simpleParser(input: string | Buffer | Readable): Promise<ParsedMail>;
}

declare module "dkim-signer" {
  export function DKIMSign(
    email: string,
    options: {
      domainName: string;
      keySelector: string;
      privateKey: string | Buffer;
      headerFieldNames?: string;
    },
  ): string;
}

declare module "nodemailer" {
  export type Transporter = {
    sendMail(input: {
      envelope?: {
        from: string;
        to: string[];
      };
      raw: string;
    }): Promise<unknown>;
  };

  export default {
    createTransport(options: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    }): Transporter;
  };
}
