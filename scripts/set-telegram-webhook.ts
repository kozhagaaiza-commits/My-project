// Регистрация webhook Telegram-бота (Чертёж 5.9.2, Блок 3): npx tsx scripts/set-telegram-webhook.ts [--info] [--dry-run]
//   (без флагов) — setWebhook: url=<NEXT_PUBLIC_SITE_URL>/api/webhooks/telegram, secret_token, allowed_updates=["message"]
//   --info       — только getWebhookInfo (текущая регистрация)
//   --dry-run    — показать, что будет отправлено, без запроса
// Переменные читаются из окружения и .env.local (через @next/env). env.ts не используется: он server-only.
// Вывод НЕ содержит токена бота и значения секрета.
import { loadEnvConfig } from "@next/env";
import {
  TELEGRAM_API, buildWebhookSetup, describeDryRun, parseFlags, redactToken, setWebhookBody,
  type WebhookSetup,
} from "./telegram-webhook-lib";

async function call(setup: WebhookSetup, method: string, body: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${setup.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json: unknown = await res.json().catch(() => null);
    const text = redactToken(JSON.stringify(json, null, 2) ?? `HTTP ${res.status}`, setup.token);
    const ok = res.ok && typeof json === "object" && json !== null && (json as { ok?: unknown }).ok === true;
    return { ok, text };
  } catch (err: unknown) {
    return { ok: false, text: redactToken(`Не удалось связаться с Telegram: ${err instanceof Error ? err.name : "ошибка"}`, setup.token) };
  }
}

async function main(): Promise<number> {
  loadEnvConfig(process.cwd());
  const flags = parseFlags(process.argv.slice(2));
  if (flags.unknown.length > 0) {
    console.error(`Неизвестные аргументы: ${flags.unknown.join(" ")}. Доступно: --info, --dry-run`);
    return 2;
  }
  const built = buildWebhookSetup(process.env);
  if (!built.ok) {
    for (const e of built.errors) console.error(`Ошибка: ${e}`);
    return 1;
  }
  const { setup } = built;

  if (flags.dryRun) {
    for (const line of describeDryRun(setup)) console.log(line);
    return 0;
  }
  if (flags.info) {
    const r = await call(setup, "getWebhookInfo", {});
    console.log(r.text);
    return r.ok ? 0 : 1;
  }
  const r = await call(setup, "setWebhook", setWebhookBody(setup));
  console.log(r.ok ? `Webhook зарегистрирован: ${setup.url}` : "Webhook НЕ зарегистрирован");
  console.log(r.text);
  return r.ok ? 0 : 1;
}

main().then(
  (code) => { process.exitCode = code; },
  (err: unknown) => {
    console.error(redactToken(`Сбой скрипта: ${err instanceof Error ? err.message : String(err)}`, process.env.TELEGRAM_BOT_TOKEN ?? ""));
    process.exitCode = 1;
  },
);
