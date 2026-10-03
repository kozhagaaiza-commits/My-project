// Чистая логика scripts/set-telegram-webhook.ts (без server-only и env.ts: скрипт запускается через `npx tsx` вне Next.js).
// Чертёж 5.9.2 / Блок 3: setWebhook url = <SITE>/api/webhooks/telegram, secret_token = TELEGRAM_WEBHOOK_SECRET, allowed_updates = ["message"].
// Токен бота входит в URL запроса: он НИКОГДА не печатается (redactToken).

export const WEBHOOK_PATH = "/api/webhooks/telegram";
export const ALLOWED_UPDATES = ["message"] as const;
export const TELEGRAM_API = "https://api.telegram.org";

export interface WebhookSetup {
  token: string;
  url: string;
  secretToken: string;
  allowedUpdates: string[];
}

export type SetupResult = { ok: true; setup: WebhookSetup } | { ok: false; errors: string[] };

const TOKEN_RE = /^\d+:[A-Za-z0-9_-]{30,}$/;
const SECRET_RE = /^[A-Za-z0-9_-]{32,256}$/;

export function buildWebhookSetup(vars: Record<string, string | undefined>): SetupResult {
  const errors: string[] = [];
  const token = vars.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const secret = vars.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  const site = vars.NEXT_PUBLIC_SITE_URL?.trim() ?? "";

  if (!token) errors.push("TELEGRAM_BOT_TOKEN не задан");
  else if (!TOKEN_RE.test(token)) errors.push("TELEGRAM_BOT_TOKEN имеет неверный формат (ожидается 123456:ABC…)");
  if (!secret) errors.push("TELEGRAM_WEBHOOK_SECRET не задан");
  else if (!SECRET_RE.test(secret)) errors.push("TELEGRAM_WEBHOOK_SECRET: 32–256 символов из A-Z a-z 0-9 _ -");

  let url = "";
  if (!site) errors.push("NEXT_PUBLIC_SITE_URL не задан");
  else {
    try {
      const u = new URL(site);
      if (u.protocol !== "https:") errors.push("NEXT_PUBLIC_SITE_URL должен начинаться с https:// (Telegram не принимает http)");
      else url = `${u.origin}${WEBHOOK_PATH}`;
    } catch {
      errors.push("NEXT_PUBLIC_SITE_URL не является адресом");
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, setup: { token, url, secretToken: secret, allowedUpdates: [...ALLOWED_UPDATES] } };
}

/** Убирает токен бота (и любой фрагмент bot<id>:<secret>) из текста. */
export function redactToken(text: string, token: string): string {
  let out = token ? text.split(token).join("<token>") : text;
  out = out.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot<token>");
  return out;
}

/** Тело запроса setWebhook (JSON). */
export function setWebhookBody(s: WebhookSetup): Record<string, unknown> {
  return { url: s.url, secret_token: s.secretToken, allowed_updates: s.allowedUpdates };
}

/** Строки для --dry-run: адрес и параметры без токена бота и без значения секрета. */
export function describeDryRun(s: WebhookSetup): string[] {
  return [
    "Режим --dry-run: запрос не отправлен.",
    `setWebhook url:      ${s.url}`,
    `allowed_updates:     ${JSON.stringify(s.allowedUpdates)}`,
    `secret_token:        задан (${s.secretToken.length} символов, не показывается)`,
  ];
}

export interface Flags { info: boolean; dryRun: boolean; unknown: string[] }

export function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = { info: false, dryRun: false, unknown: [] };
  for (const a of argv) {
    if (a === "--info") flags.info = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else flags.unknown.push(a);
  }
  return flags;
}
