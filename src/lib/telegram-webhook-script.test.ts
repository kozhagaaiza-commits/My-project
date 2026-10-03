import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALLOWED_UPDATES, buildWebhookSetup, describeDryRun, parseFlags, redactToken, setWebhookBody,
} from "../../scripts/telegram-webhook-lib";

// Сборка параметров scripts/set-telegram-webhook.ts (запрос к Telegram не выполняется).

const TOKEN = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw-x";
const SECRET = "w".repeat(40);
const VARS = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_WEBHOOK_SECRET: SECRET, NEXT_PUBLIC_SITE_URL: "https://forgecarbon.vercel.app" };

describe("set-telegram-webhook: параметры", () => {
  it("url = <SITE>/api/webhooks/telegram, secret_token, allowed_updates [\"message\"]", () => {
    const r = buildWebhookSetup(VARS);
    assert.ok(r.ok);
    assert.equal(r.setup.url, "https://forgecarbon.vercel.app/api/webhooks/telegram");
    assert.deepEqual(setWebhookBody(r.setup), {
      url: "https://forgecarbon.vercel.app/api/webhooks/telegram", secret_token: SECRET, allowed_updates: ["message"],
    });
    assert.deepEqual([...ALLOWED_UPDATES], ["message"]);
  });

  it("слэш и путь в конце SITE_URL не дублируются", () => {
    const r = buildWebhookSetup({ ...VARS, NEXT_PUBLIC_SITE_URL: "https://forgecarbon.vercel.app/" });
    assert.ok(r.ok);
    assert.equal(r.setup.url, "https://forgecarbon.vercel.app/api/webhooks/telegram");
  });

  it("не заданные / неверные переменные → список ошибок на русском", () => {
    const empty = buildWebhookSetup({});
    assert.ok(!empty.ok);
    assert.equal(empty.errors.length, 3);
    const bad = buildWebhookSetup({ TELEGRAM_BOT_TOKEN: "abc", TELEGRAM_WEBHOOK_SECRET: "short", NEXT_PUBLIC_SITE_URL: "http://forgecarbon.vercel.app" });
    assert.ok(!bad.ok);
    assert.match(bad.errors.join("\n"), /TELEGRAM_BOT_TOKEN имеет неверный формат/);
    assert.match(bad.errors.join("\n"), /TELEGRAM_WEBHOOK_SECRET: 32–256/);
    assert.match(bad.errors.join("\n"), /https/);
  });

  it("--dry-run и вывод не содержат токен бота и значение секрета", () => {
    const r = buildWebhookSetup(VARS);
    assert.ok(r.ok);
    const out = describeDryRun(r.setup).join("\n");
    assert.ok(!out.includes(TOKEN));
    assert.ok(!out.includes("AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"));
    assert.ok(!out.includes(SECRET));
    assert.match(out, /https:\/\/forgecarbon\.vercel\.app\/api\/webhooks\/telegram/);
  });

  it("redactToken убирает токен из ответов и ошибок", () => {
    assert.equal(redactToken(`fail https://api.telegram.org/bot${TOKEN}/setWebhook`, TOKEN), "fail https://api.telegram.org/bot<token>/setWebhook");
    assert.ok(!redactToken(`x ${TOKEN} y`, TOKEN).includes(TOKEN));
  });

  it("флаги --info и --dry-run", () => {
    assert.deepEqual(parseFlags([]), { info: false, dryRun: false, unknown: [] });
    assert.deepEqual(parseFlags(["--info", "--dry-run"]), { info: true, dryRun: true, unknown: [] });
    assert.deepEqual(parseFlags(["--x"]).unknown, ["--x"]);
  });
});
