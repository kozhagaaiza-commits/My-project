import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { FakeTelegram, tgError } from "@/lib/notifications/__fixtures__/fake-telegram";
import {
  TELEGRAM_API_URL, createTelegramClient, escapeHtml, redactSecrets, resolveTelegramBaseUrl, type TelegramClient,
} from "@/lib/telegram";

const TOKEN = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw-x";
let fake: FakeTelegram;
let sleeps: number[];

const client = (over: Partial<Parameters<typeof createTelegramClient>[0]> = {}): TelegramClient =>
  createTelegramClient({ token: TOKEN, baseUrl: fake.url, sleep: async (ms) => { sleeps.push(ms); }, ...over });

before(async () => { fake = await new FakeTelegram().start(); });
after(async () => { await fake.stop(); });
beforeEach(() => { fake.reset(); sleeps = []; });
afterEach(() => mock.restoreAll());

describe("escapeHtml", () => {
  it("экранирует & < > \"", () => {
    assert.equal(escapeHtml(`<b>"A" & B</b>`), "&lt;b&gt;&quot;A&quot; &amp; B&lt;/b&gt;");
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(42), "42");
  });
});

describe("Telegram-клиент: sendMessage", () => {
  it("успех: parse_mode HTML, link_preview_options.is_disabled, токен в пути", async () => {
    const res = await client().sendMessage("512398764", "Привет <b>мир</b>");
    assert.deepEqual(res, { kind: "ok", result: { message_id: 101 } });
    assert.equal(fake.requests.length, 1);
    const r = fake.requests[0];
    assert.equal(r.method, "sendMessage");
    assert.equal(r.token, TOKEN);
    assert.deepEqual(r.body, {
      chat_id: "512398764", text: "Привет <b>мир</b>", parse_mode: "HTML", link_preview_options: { is_disabled: true },
    });
    assert.deepEqual(sleeps, []);
  });

  it("forwardMessage / setWebhook / getWebhookInfo: параметры", async () => {
    const c = client();
    assert.equal((await c.forwardMessage("-100", "55", 41)).kind, "ok");
    assert.deepEqual(fake.of("forwardMessage")[0].body, { chat_id: "-100", from_chat_id: "55", message_id: 41 });
    assert.equal((await c.setWebhook({ url: "https://x.test/api/webhooks/telegram", secretToken: "s".repeat(32), allowedUpdates: ["message"] })).kind, "ok");
    assert.deepEqual(fake.of("setWebhook")[0].body, { url: "https://x.test/api/webhooks/telegram", secret_token: "s".repeat(32), allowed_updates: ["message"] });
    fake.script({ status: 200, json: { ok: true, result: { url: "https://x.test", pending_update_count: 0 } } });
    const info = await c.getWebhookInfo();
    assert.equal(info.kind === "ok" && info.result.url, "https://x.test");
  });

  it("5xx: 3 попытки, паузы 0.5 и 1 с, затем failed", async () => {
    fake.script(tgError(502, "Bad Gateway"), tgError(500, "Internal"), tgError(503, "Unavailable"));
    const res = await client().sendMessage("1", "t");
    assert.equal(res.kind, "failed");
    assert.equal(fake.requests.length, 3);
    assert.deepEqual(sleeps, [500, 1000]);
  });

  it("5xx → успех со второй попытки", async () => {
    fake.script(tgError(502, "Bad Gateway"));
    const res = await client().sendMessage("1", "t");
    assert.equal(res.kind, "ok");
    assert.equal(fake.requests.length, 2);
    assert.deepEqual(sleeps, [500]);
  });

  it("429 с retry_after ≤ 5: пауза retry_after секунд и повтор", async () => {
    fake.script(tgError(429, "Too Many Requests: retry after 3", 3));
    const res = await client().sendMessage("1", "t");
    assert.equal(res.kind, "ok");
    assert.deepEqual(sleeps, [3000]);
    assert.equal(fake.requests.length, 2);
  });

  it("429 с retry_after > 5: без ожидания — rate_limited (в очередь)", async () => {
    fake.script(tgError(429, "Too Many Requests: retry after 30", 30));
    const res = await client().sendMessage("1", "t");
    assert.deepEqual(res, { kind: "rate_limited", retryAfterSeconds: 30, error: "Too Many Requests: retry after 30" });
    assert.equal(fake.requests.length, 1);
    assert.deepEqual(sleeps, []);
  });

  it("429 на всех попытках → rate_limited после третьей", async () => {
    fake.script(tgError(429, "slow", 2), tgError(429, "slow", 2), tgError(429, "slow", 2));
    const res = await client().sendMessage("1", "t");
    assert.equal(res.kind, "rate_limited");
    assert.equal(fake.requests.length, 3);
    assert.deepEqual(sleeps, [2000, 2000]);
  });

  it("403 — blocked без повторов", async () => {
    fake.script(tgError(403, "Forbidden: bot was blocked by the user"));
    const res = await client().sendMessage("1", "t");
    assert.deepEqual(res, { kind: "blocked", error: "Forbidden: bot was blocked by the user" });
    assert.equal(fake.requests.length, 1);
    assert.deepEqual(sleeps, []);
  });

  it("прочие 4xx — rejected без повторов", async () => {
    fake.script(tgError(400, "Bad Request: chat not found"));
    const res = await client().sendMessage("1", "t");
    assert.deepEqual(res, { kind: "rejected", status: 400, error: "Bad Request: chat not found" });
    assert.equal(fake.requests.length, 1);
  });

  it("таймаут одной попытки: 3 попытки и failed", async () => {
    fake.script("hang", "hang", "hang");
    const res = await client({ timeoutMs: 80 }).sendMessage("1", "t");
    assert.equal(res.kind, "failed");
    assert.match(res.kind === "failed" ? res.error : "", /таймаут/);
    assert.equal(fake.requests.length, 3);
    assert.deepEqual(sleeps, [500, 1000]);
  });

  it("сеть недоступна (порт закрыт): failed без токена в тексте", async () => {
    const res = await client({ baseUrl: "http://127.0.0.1:1" }).sendMessage("1", "t");
    assert.equal(res.kind, "failed");
    assert.ok(!JSON.stringify(res).includes(TOKEN));
  });

  it("2xx с битым JSON → повтор, затем failed", async () => {
    fake.script({ status: 200 }, { status: 200 }, { status: 200 });
    const res = await client().sendMessage("1", "t");
    assert.equal(res.kind, "failed");
    assert.equal(fake.requests.length, 3);
  });
});

describe("Telegram-клиент: токен не утекает", () => {
  it("fetch бросает ошибку с URL, содержащим токен → в результате токена нет", async () => {
    const leaky: typeof fetch = async (input) => { throw new Error(`request to ${String(input)} failed`); };
    const res = await createTelegramClient({ token: TOKEN, fetchImpl: leaky, sleep: async () => {} }).sendMessage("1", "t");
    assert.equal(res.kind, "failed");
    assert.ok(!JSON.stringify(res).includes(TOKEN));
    assert.ok(!JSON.stringify(res).includes("AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"));
  });

  it("description Telegram с токеном редактируется", async () => {
    fake.script(tgError(400, `Bad Request: url https://api.telegram.org/bot${TOKEN}/getMe invalid`));
    const res = await client().sendMessage("1", "t");
    assert.equal(res.kind, "rejected");
    assert.ok(!JSON.stringify(res).includes(TOKEN));
    assert.match(JSON.stringify(res), /redacted/);
  });

  it("клиент ничего не пишет в console", async () => {
    const log = mock.method(console, "error", () => {});
    const info = mock.method(console, "log", () => {});
    fake.script(tgError(502, "x"), tgError(403, "Forbidden"));
    await client().sendMessage("1", "t");
    assert.equal(log.mock.callCount() + info.mock.callCount(), 0);
  });

  it("redactSecrets вырезает токен и шаблон bot<id>:<secret>", () => {
    assert.equal(redactSecrets(`x ${TOKEN} y`, [TOKEN]), "x <redacted> y");
    assert.ok(!redactSecrets("GET /bot987654321:ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ/send").includes("987654321"));
  });
});

describe("resolveTelegramBaseUrl", () => {
  it("override учитывается вне production", () => {
    assert.equal(resolveTelegramBaseUrl({ NODE_ENV: "test", TELEGRAM_API_URL: "http://127.0.0.1:9999/" }), "http://127.0.0.1:9999");
    assert.equal(resolveTelegramBaseUrl({ NODE_ENV: "development" }), TELEGRAM_API_URL);
  });
  it("вне development/test (production, staging, пусто) TELEGRAM_API_URL игнорируется", () => {
    for (const NODE_ENV of ["staging", undefined]) {
      assert.equal(resolveTelegramBaseUrl({ NODE_ENV, TELEGRAM_API_URL: "http://evil.test" }), "https://api.telegram.org");
    }
  });
  it("в production TELEGRAM_API_URL игнорируется", () => {
    assert.equal(resolveTelegramBaseUrl({ NODE_ENV: "production", TELEGRAM_API_URL: "http://evil.test" }), "https://api.telegram.org");
  });
  it("не-http схема отклоняется", () => {
    assert.throws(() => resolveTelegramBaseUrl({ NODE_ENV: "test", TELEGRAM_API_URL: "file:///etc/passwd" }));
  });
});
