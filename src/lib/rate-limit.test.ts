import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// rate-limit.ts → supabase/admin.ts → env.ts проверяет переменные при импорте: подставляем значения нужного формата.
const TEST_ENV: Record<string, string> = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40), SUPABASE_SERVICE_ROLE_KEY: "s".repeat(40), YOOKASSA_SHOP_ID: "123456",
  YOOKASSA_SECRET_KEY: "test_secret_key", TELEGRAM_BOT_TOKEN: `123456:${"A".repeat(35)}`, TELEGRAM_BOT_USERNAME: "forgecarbon_bot",
  TELEGRAM_WEBHOOK_SECRET: "w".repeat(32), TELEGRAM_ADMIN_CHAT_ID: "-100123", SMTP_HOST: "smtp.yandex.ru", SMTP_PORT: "465",
  SMTP_USER: "orders@forgecarbon.ru", SMTP_PASSWORD: "password1", CRON_SECRET: "c".repeat(32),
  ORDER_TOKEN_SECRET: "o".repeat(40),
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
  it("лимиты заказа и оплаты — 5/600 с на IP и 10/600 с на заказ (5.10)", () => {
    assert.deepEqual(mod.RATE_LIMITS.orders, { limit: 5, windowSeconds: 600 });
    assert.deepEqual(mod.RATE_LIMITS.pay, { limit: 10, windowSeconds: 600 });
  });
  it("429 POST /api/orders: текст Блока 3 и Retry-After 600", async () => {
    const res = mod.rateLimitedResponse(600, mod.ORDERS_RATE_LIMITED_MESSAGE);
    assert.equal(res.headers.get("Retry-After"), "600");
    assert.deepEqual(await res.json(), {
      error: { code: "RATE_LIMITED", message: "Слишком много попыток оформления. Повторите через 10 минут", details: { retry_after_seconds: 600 } },
    });
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

describe("limitPayWith: 10 / 600 с на заказ с IP + общий потолок 100 / 600 с на заказ", () => {
  /** Фиксированное окно в памяти: как check_rate_limit (каждый вызов считается). */
  function memoryCheck() {
    const hits = new Map<string, number>();
    const keys: string[] = [];
    const check = async (key: string, limit: number) => {
      keys.push(key);
      const n = (hits.get(key) ?? 0) + 1;
      hits.set(key, n);
      return n <= limit;
    };
    return { check, hits, keys };
  }
  const reqFrom = (ip: string) => new Request("http://localhost/api/orders/FC-26-000123/pay", { method: "POST", headers: { "x-forwarded-for": ip } });

  it("лимиты 5.10: pay 10/600, payOrder 100/600", () => {
    assert.deepEqual(mod.RATE_LIMITS.payOrder, { limit: 100, windowSeconds: 600 });
  });

  it("ключи: сначала pay:<номер>:<ip>, затем pay:<номер>", async () => {
    const m = memoryCheck();
    assert.equal(await mod.limitPayWith(m.check, reqFrom("203.0.113.7, 10.0.0.1"), "FC-26-000123"), null);
    assert.deepEqual(m.keys, ["pay:FC-26-000123:203.0.113.7", "pay:FC-26-000123"]);
  });

  it("один IP исчерпал свои 10 — 429 (Retry-After 600), другой IP того же заказа проходит; общий потолок не расходуется", async () => {
    const m = memoryCheck();
    for (let i = 0; i < 10; i++) assert.equal(await mod.limitPayWith(m.check, reqFrom("203.0.113.7"), "FC-26-000123"), null);
    const res = await mod.limitPayWith(m.check, reqFrom("203.0.113.7"), "FC-26-000123");
    assert.equal(res?.status, 429);
    assert.equal(res?.headers.get("Retry-After"), "600");
    assert.equal(await mod.limitPayWith(m.check, reqFrom("198.51.100.2"), "FC-26-000123"), null);
    assert.equal(m.hits.get("pay:FC-26-000123"), 11);
    assert.equal(await mod.limitPayWith(m.check, reqFrom("203.0.113.7"), "FC-26-000124"), null);
  });

  it("общий потолок: 100 запросов со 100 разных IP проходят, 101-й с нового IP — 429", async () => {
    const m = memoryCheck();
    for (let i = 0; i < 100; i++) assert.equal(await mod.limitPayWith(m.check, reqFrom(`10.0.${Math.floor(i / 250)}.${i % 250}`), "FC-26-000123"), null);
    const res = await mod.limitPayWith(m.check, reqFrom("192.0.2.200"), "FC-26-000123");
    assert.equal(res?.status, 429);
    assert.deepEqual(await res?.json(), {
      error: { code: "RATE_LIMITED", message: "Слишком много запросов. Повторите через минуту", details: { retry_after_seconds: 600 } },
    });
  });

  it("fail-closed: сбой проверки пробрасывается (→ 500 в обработчике)", async () => {
    const failing = async () => { throw new Error("check_rate_limit: down"); };
    await assert.rejects(mod.limitPayWith(failing, reqFrom("203.0.113.7"), "FC-26-000123"), /down/);
  });
});
