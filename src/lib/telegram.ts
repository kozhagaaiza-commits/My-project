import "server-only";
import { z } from "zod";

// Клиент Telegram Bot API (Чертёж 5.9.2). REST: https://api.telegram.org/bot<TOKEN>/<method>.
// Решения Дня 5:
//  - методы возвращают дискриминированный union, а не исключения: вызывающий код (очередь, бот) разбирает результат;
//  - 3 попытки; паузы между ними — 0.5 / 1 с (третья ступень графика 0.5 / 1 / 2 с нужна только при увеличении числа попыток:
//    попыток по Чертежу ровно 3, поэтому до паузы 2 с дело не доходит); таймаут одной попытки — 5 с;
//  - 429: пауза retry_after секунд, если ≤ 5 (и попытка повторяется); иначе kind "rate_limited" — вызывающий ставит в очередь;
//  - 403 (бот заблокирован) — kind "blocked", без повторов; прочие 4xx — kind "rejected", без повторов;
//  - ТОКЕН ВХОДИТ В URL: он вырезается из любого текста ошибки (redactSecrets), в логи и last_error не попадает;
//  - TELEGRAM_API_URL (fake-сервер в тестах) учитывается только при NODE_ENV !== "production";
//  - экземпляр по умолчанию создаётся лениво: модуль не читает env при импорте.

export const TELEGRAM_API_URL = "https://api.telegram.org";
export const TELEGRAM_RETRY_PAUSES_MS = [500, 1000, 2000] as const;
export const TELEGRAM_MAX_ATTEMPTS = 3;
export const TELEGRAM_TIMEOUT_MS = 5000;
export const TELEGRAM_MAX_RETRY_AFTER_S = 5;

/** Экранирование значений для parse_mode "HTML" (и HTML писем): & < > ". */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type TelegramResult<T = unknown> =
  | { kind: "ok"; result: T }
  /** 403: бот заблокирован пользователем / удалён из чата. Не повторять; orders.telegram_chat_id обнуляется. */
  | { kind: "blocked"; error: string }
  /** 429 с retry_after > 5 с (или последняя попытка): ставить в очередь. */
  | { kind: "rate_limited"; retryAfterSeconds: number; error: string }
  /** Прочие 4xx (неверный чат, разметка, токен): повтор сразу не поможет. */
  | { kind: "rejected"; status: number; error: string }
  /** Сеть, таймаут, 5xx, битый ответ — все попытки исчерпаны. */
  | { kind: "failed"; error: string };

export interface TelegramMessage {
  message_id: number;
}

export interface TelegramWebhookInfo {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  allowed_updates?: string[];
  [key: string]: unknown;
}

export interface TelegramClient {
  sendMessage(chatId: string | number, text: string): Promise<TelegramResult<TelegramMessage>>;
  forwardMessage(chatId: string | number, fromChatId: string | number, messageId: number): Promise<TelegramResult<TelegramMessage>>;
  setWebhook(params: { url: string; secretToken: string; allowedUpdates: string[] }): Promise<TelegramResult<true>>;
  getWebhookInfo(): Promise<TelegramResult<TelegramWebhookInfo>>;
}

export interface TelegramClientConfig {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Пауза между попытками; в тестах — мгновенная. */
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const envelope = z.object({
  ok: z.boolean(),
  result: z.unknown().optional(),
  error_code: z.number().optional(),
  description: z.string().optional(),
  parameters: z.object({ retry_after: z.number().optional() }).passthrough().optional(),
});

/** Вырезает токен бота (и любой фрагмент `bot<id>:<secret>`) из текста. */
export function redactSecrets(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join("<redacted>");
  return out.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot<redacted>").replace(/\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g, "<redacted>");
}

const short = (s: string) => (s.length > 200 ? `${s.slice(0, 200)}…` : s);

/** Базовый URL: TELEGRAM_API_URL переопределяет его только при NODE_ENV !== "production". */
export function resolveTelegramBaseUrl(vars: { NODE_ENV?: string; TELEGRAM_API_URL?: string } = process.env): string {
  const override = vars.TELEGRAM_API_URL?.trim();
  if (!override || vars.NODE_ENV === "production") return TELEGRAM_API_URL;
  const url = new URL(override);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("TELEGRAM_API_URL: только http(s)");
  return override.replace(/\/$/, "");
}

export function createTelegramClient(cfg: TelegramClientConfig): TelegramClient {
  const base = (cfg.baseUrl ?? TELEGRAM_API_URL).replace(/\/$/, "");
  const doFetch = cfg.fetchImpl ?? fetch;
  const sleep = cfg.sleep ?? realSleep;
  const timeoutMs = cfg.timeoutMs ?? TELEGRAM_TIMEOUT_MS;
  const clean = (s: string) => short(redactSecrets(s, [cfg.token]));

  async function call<T>(method: string, body: Record<string, unknown>): Promise<TelegramResult<T>> {
    let lastError = "нет ответа";
    for (let attempt = 0; attempt < TELEGRAM_MAX_ATTEMPTS; attempt++) {
      let waitMs = TELEGRAM_RETRY_PAUSES_MS[attempt];
      try {
        const res = await doFetch(`${base}/bot${cfg.token}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        });
        const parsed = envelope.safeParse(await res.json().catch(() => null));
        const data = parsed.success ? parsed.data : null;
        const description = clean(data?.description ?? `HTTP ${res.status}`);

        if (res.ok && data?.ok) return { kind: "ok", result: data.result as T };
        if (res.status === 403) return { kind: "blocked", error: description };
        if (res.status === 429) {
          const retryAfter = Math.max(1, Math.ceil(data?.parameters?.retry_after ?? 1));
          if (retryAfter > TELEGRAM_MAX_RETRY_AFTER_S) return { kind: "rate_limited", retryAfterSeconds: retryAfter, error: description };
          if (attempt === TELEGRAM_MAX_ATTEMPTS - 1) return { kind: "rate_limited", retryAfterSeconds: retryAfter, error: description };
          lastError = description;
          waitMs = retryAfter * 1000;
        } else if (res.status >= 400 && res.status < 500) {
          return { kind: "rejected", status: res.status, error: description };
        } else {
          lastError = res.ok ? "некорректный ответ Telegram" : description;
        }
      } catch (err: unknown) {
        const name = err instanceof Error ? err.name : "Error";
        lastError = name === "TimeoutError" || name === "AbortError" ? `таймаут ${timeoutMs} мс` : clean(`сеть: ${name}`);
      }
      if (attempt < TELEGRAM_MAX_ATTEMPTS - 1) await sleep(waitMs);
    }
    return { kind: "failed", error: lastError };
  }

  return {
    sendMessage: (chatId, text) =>
      call<TelegramMessage>("sendMessage", {
        chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true },
      }),
    forwardMessage: (chatId, fromChatId, messageId) =>
      call<TelegramMessage>("forwardMessage", { chat_id: chatId, from_chat_id: fromChatId, message_id: messageId }),
    setWebhook: ({ url, secretToken, allowedUpdates }) =>
      call<true>("setWebhook", { url, secret_token: secretToken, allowed_updates: allowedUpdates }),
    getWebhookInfo: () => call<TelegramWebhookInfo>("getWebhookInfo", {}),
  };
}

let defaultClient: Promise<TelegramClient> | null = null;

/** Экземпляр по умолчанию из env (env.ts разбирается при первом вызове, а не при импорте модуля). */
export function getTelegramClient(): Promise<TelegramClient> {
  defaultClient ??= import("@/lib/env")
    .then(({ env }) => createTelegramClient({ token: env.TELEGRAM_BOT_TOKEN, baseUrl: resolveTelegramBaseUrl() }))
    .catch((err: unknown) => {
      defaultClient = null;
      throw err;
    });
  return defaultClient;
}
