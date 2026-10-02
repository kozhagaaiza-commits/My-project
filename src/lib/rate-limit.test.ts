import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// rate-limit.ts → supabase/admin.ts → env.ts проверяет переменные при импорте: подставляем значения нужного формата.
const TEST_ENV: Record<string, string> = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40), SUPABASE_SERVICE_ROLE_KEY: "s".repeat(40), YOOKASSA_SHOP_ID: "123456",
  YOOKASSA_SECRET_KEY: "test_secret_key", TELEGRAM_BOT_TOKEN: `123456:${"A".repeat(35)}`, TELEGRAM_BOT_USERNAME: "forgecarbon_bot",
  TELEGRAM_WEBHOOK_SECRET: "w".repeat(32), TELEGRAM_ADMIN_CHAT_ID: "-100123", SMTP_HOST: "smtp.yandex.ru", SMTP_PORT: "465",
  SMTP_USER: "orders@forgecarbon.ru", SMTP_PASSWORD: "password1", CRON_SECRET: "c".repeat(32),
};

let mod: typeof import("@/lib/rate-limit");
before(async () => {
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] ??= v;
  mod = await import("@/lib/rate-limit");
});

describe("rate limit (5.10)", () => {
  it("IP — первый адрес x-forwarded-for, иначе unknown", () => {
    const req = (h: Record<string, string>) => new Request("http://localhost/api/products", { headers: h });
    assert.equal(mod.getClientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
    assert.equal(mod.getClientIp(req({ "x-forwarded-for": " 198.51.100.2 " })), "198.51.100.2");
    assert.equal(mod.getClientIp(req({})), "unknown");
  });
  it("лимит каталога — 120 за 60 с", () => {
    assert.deepEqual(mod.RATE_LIMITS.catalog, { limit: 120, windowSeconds: 60 });
  });
  it("лимит проверки корзины — 60 за 60 с (5.10)", () => {
    assert.deepEqual(mod.RATE_LIMITS.cart, { limit: 60, windowSeconds: 60 });
  });
  it("429: JSON из 3.0 и Retry-After", async () => {
    const res = mod.rateLimitedResponse(60);
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("Retry-After"), "60");
    assert.deepEqual(await res.json(), {
      error: { code: "RATE_LIMITED", message: "Слишком много запросов. Повторите через минуту", details: { retry_after_seconds: 60 } },
    });
  });
});
