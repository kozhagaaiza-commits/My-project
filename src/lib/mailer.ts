import "server-only";
import nodemailer from "nodemailer";
import { SITE_NAME } from "@/lib/config";

// Почта через SMTP Яндекса (Чертёж 5.9.3): nodemailer, smtp.yandex.ru:465 (secure), connectionTimeout 10 с.
// `from: "ForgeCarbon <SMTP_USER>"`, `replyTo: SMTP_USER`, HTML + текстовая версия.
// Retry: 2 попытки (паузы 0 / 2 с). Результат — union, исключения наружу не выходят; пароль SMTP в текст ошибки не попадает.
// Транспорт, from и replyTo берутся лениво: env не разбирается при импорте модуля.

export const SMTP_RETRY_PAUSES_MS = [0, 2000] as const;
export const SMTP_MAX_ATTEMPTS = 2;

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type MailResult = { kind: "ok"; messageId: string } | { kind: "failed"; error: string };

/** Минимальный контракт транспорта (подходит nodemailer Transporter, jsonTransport и stream-транспорт). */
export interface MailTransport {
  sendMail(options: {
    from: string; replyTo: string; to: string; subject: string; html: string; text: string;
  }): Promise<{ messageId?: string }>;
}

export interface Mailer {
  sendMail(message: MailMessage): Promise<MailResult>;
}

export interface MailerConfig {
  transport?: MailTransport;
  /** Полное значение заголовка From. По умолчанию `ForgeCarbon <SMTP_USER>`. */
  from?: string;
  replyTo?: string;
  sleep?: (ms: number) => Promise<void>;
  /** Строки, которые нельзя показывать в ошибках (пароль). */
  secrets?: readonly string[];
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function describeError(err: unknown, secrets: readonly string[]): string {
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
  const message = err instanceof Error ? err.message : String(err);
  let text = `${code ? `${code}: ` : ""}${message}`;
  for (const s of secrets) if (s) text = text.split(s).join("<redacted>");
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

interface Resolved { transport: MailTransport; from: string; replyTo: string; secrets: readonly string[] }

async function resolveFromEnv(cfg: MailerConfig): Promise<Resolved> {
  const { env } = await import("@/lib/env");
  const transport: MailTransport = cfg.transport ?? nodemailer.createTransport({
    host: "smtp.yandex.ru",
    port: 465,
    secure: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return {
    transport,
    from: cfg.from ?? `${SITE_NAME} <${env.SMTP_USER}>`,
    replyTo: cfg.replyTo ?? env.SMTP_USER,
    secrets: [env.SMTP_PASSWORD, ...(cfg.secrets ?? [])],
  };
}

export function createMailer(cfg: MailerConfig = {}): Mailer {
  const sleep = cfg.sleep ?? realSleep;
  let resolved: Promise<Resolved> | null = null;
  const resolve = (): Promise<Resolved> => {
    resolved ??= cfg.transport && cfg.from && cfg.replyTo
      ? Promise.resolve({ transport: cfg.transport, from: cfg.from, replyTo: cfg.replyTo, secrets: cfg.secrets ?? [] })
      : resolveFromEnv(cfg).catch((err: unknown) => {
        resolved = null;
        throw err;
      });
    return resolved;
  };

  return {
    async sendMail(message) {
      let r: Resolved;
      try {
        r = await resolve();
      } catch (err: unknown) {
        return { kind: "failed", error: describeError(err, cfg.secrets ?? []) };
      }
      let lastError = "нет ответа";
      for (let attempt = 0; attempt < SMTP_MAX_ATTEMPTS; attempt++) {
        const pause = SMTP_RETRY_PAUSES_MS[attempt];
        if (pause > 0) await sleep(pause);
        try {
          const info = await r.transport.sendMail({
            from: r.from, replyTo: r.replyTo, to: message.to, subject: message.subject, html: message.html, text: message.text,
          });
          return { kind: "ok", messageId: info.messageId ?? "" };
        } catch (err: unknown) {
          lastError = describeError(err, r.secrets);
        }
      }
      return { kind: "failed", error: lastError };
    },
  };
}

let defaultMailer: Mailer | null = null;

/** Экземпляр по умолчанию: SMTP Яндекса из env (создаётся при первой отправке). */
export function getMailer(): Mailer {
  defaultMailer ??= createMailer();
  return defaultMailer;
}
