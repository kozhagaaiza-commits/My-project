import assert from "node:assert/strict";
import { afterEach, before, describe, it, mock } from "node:test";
import { createCartValidateHandler, type CartValidateDeps } from "@/app/api/cart/validate/handler";
import { apiError } from "@/lib/api-error";
import { assertSameOrigin } from "@/lib/csrf";
import { formatRub } from "@/lib/money";
import type { CartProduct } from "@/types/cart";

// rate-limit.ts → supabase/admin.ts → env.ts проверяет переменные при импорте: подставляем значения нужного формата
// (как в rate-limit.test.ts), чтобы взять настоящий rateLimitedResponse (429 + Retry-After).
const TEST_ENV: Record<string, string> = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40), SUPABASE_SERVICE_ROLE_KEY: "s".repeat(40), YOOKASSA_SHOP_ID: "123456",
  YOOKASSA_SECRET_KEY: "test_secret_key", TELEGRAM_BOT_TOKEN: `123456:${"A".repeat(35)}`, TELEGRAM_BOT_USERNAME: "forgecarbon_bot",
  TELEGRAM_WEBHOOK_SECRET: "w".repeat(32), TELEGRAM_ADMIN_CHAT_ID: "-100123", SMTP_HOST: "smtp.yandex.ru", SMTP_PORT: "465",
  SMTP_USER: "orders@forgecarbon.ru", SMTP_PASSWORD: "password1", CRON_SECRET: "c".repeat(32),
  ORDER_TOKEN_SECRET: "o".repeat(40),
};
let rateLimitedResponse: (retryAfterSeconds: number) => Response;
before(async () => {
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] ??= v;
  ({ rateLimitedResponse } = await import("@/lib/rate-limit"));
});

const W = "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51";
const COVER = `https://abcdefghijklmnop.supabase.co/storage/v1/object/public/product-images/products/${W}/2b9c1d7e-0a4f-4c3e-8d21-7f5e6a9b0c13.webp`;
const WHEEL: CartProduct = {
  id: W, slug: "forged-m01-r20-5x112-graphite", title: "Кованый моноблок M-01 R20, 5×112, графит", type: "wheel_set",
  availability_mode: "stock", unit_price: 13370000, available_qty: 3, cover_image_url: COVER,
};
const ORIGIN = "http://localhost:3000";
const BODY = JSON.stringify({ items: [{ product_id: W, quantity: 1 }] });

/** body: null — запрос без тела. */
const req = (body: string | null = BODY, origin: string | null = ORIGIN) => new Request("http://localhost:3000/api/cart/validate", {
  method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: body ?? undefined,
});

/** Фейковые зависимости с журналом вызовов: порядок проверяется по нему. */
function setup(over: Partial<CartValidateDeps> = {}) {
  const calls: string[] = [];
  const deps: CartValidateDeps = {
    assertSameOrigin: (r) => { calls.push("origin"); return (over.assertSameOrigin ?? (() => null))(r); },
    limitCart: async (r) => { calls.push("rate"); return (over.limitCart ?? (async () => null))(r); },
    getCatalogContext: async () => { calls.push("ctx"); return (over.getCatalogContext ?? (async () => ({ atelierId: null })))(); },
    getCartProducts: async (ids, ctx) => { calls.push(`products:${ids.join(",")}`); return (over.getCartProducts ?? (async () => [WHEEL]))(ids, ctx); },
  };
  return { calls, POST: createCartValidateHandler(deps) };
}

const forbid = () => apiError("FORBIDDEN", "Недопустимый источник запроса", 403);
const NO_STORE = "private, no-store";

describe("POST /api/cart/validate: порядок Origin → rate limit → Zod → данные", () => {
  afterEach(() => mock.restoreAll());

  it("403 при чужом Origin: rate limit, сессия и БД не вызываются", async () => {
    const { calls, POST } = setup({ assertSameOrigin: forbid });
    const res = await POST(req());
    assert.equal(res.status, 403);
    assert.deepEqual(calls, ["origin"]);
    assert.deepEqual(await res.json(), { error: { code: "FORBIDDEN", message: "Недопустимый источник запроса" } });
  });

  it("настоящий assertSameOrigin: без Origin → 403 без обращения к данным", async () => {
    const env = process.env as Record<string, string | undefined>;
    const saved = env.NEXT_PUBLIC_SITE_URL;
    env.NEXT_PUBLIC_SITE_URL = "https://forgecarbon.ru";
    try {
      const { calls, POST } = setup({ assertSameOrigin });
      assert.equal((await POST(req(BODY, null))).status, 403);
      assert.equal((await POST(req(BODY, "https://evil.example"))).status, 403);
      assert.deepEqual(calls, ["origin", "origin"]);
    } finally {
      env.NEXT_PUBLIC_SITE_URL = saved;
    }
  });

  it("429 с Retry-After: тело не разбирается, БД не вызывается", async () => {
    const { calls, POST } = setup({ limitCart: async () => rateLimitedResponse(60) });
    const res = await POST(req("{битый"));
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("Retry-After"), "60");
    assert.deepEqual(await res.json(), {
      error: { code: "RATE_LIMITED", message: "Слишком много запросов. Повторите через минуту", details: { retry_after_seconds: 60 } },
    });
    assert.deepEqual(calls, ["origin", "rate"]);
  });

  it("400 Zod — до сессии и БД", async () => {
    const { calls, POST } = setup();
    assert.equal((await POST(req(JSON.stringify({ items: [] })))).status, 400);
    assert.deepEqual(calls, ["origin", "rate"]);
  });

  it("200: Origin → rate limit → сессия → товары", async () => {
    const { calls, POST } = setup();
    assert.equal((await POST(req())).status, 200);
    assert.deepEqual(calls, ["origin", "rate", "ctx", `products:${W}`]);
  });
});

describe("POST /api/cart/validate: ответы", () => {
  afterEach(() => mock.restoreAll());

  it("400 «Корзина пуста» для items: [] (пример Блока 3)", async () => {
    const res = await setup().POST(req(JSON.stringify({ items: [] })));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      error: { code: "VALIDATION_ERROR", message: "Корзина пуста", details: { fields: { items: ["Too small: expected array to have >=1 items"] } } },
    });
  });

  it("400 «Проверьте корзину»: дубли, пустое тело, битый JSON", async () => {
    const dup = JSON.stringify({ items: [{ product_id: W, quantity: 1 }, { product_id: W, quantity: 1 }] });
    const res = await setup().POST(req(dup));
    assert.deepEqual(await res.json(), {
      error: { code: "VALIDATION_ERROR", message: "Проверьте корзину", details: { fields: { items: ["Один товар — одна позиция"] } } },
    });
    for (const body of [null, "", "{items:"]) {
      const r = await setup().POST(req(body));
      assert.equal(r.status, 400);
      assert.deepEqual(await r.json(), { error: { code: "VALIDATION_ERROR", message: "Проверьте корзину", details: { fields: {} } } });
    }
  });

  it("200 — JSON из примера Блока 3", async () => {
    const res = await setup().POST(req());
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      data: {
        kind: "stock",
        items: [{
          product_id: W, slug: "forged-m01-r20-5x112-graphite", title: "Кованый моноблок M-01 R20, 5×112, графит",
          cover_image_url: COVER, quantity: 1, max_quantity: 2,
          unit_price: 13370000, unit_price_formatted: formatRub(13370000),
          line_total: 13370000, line_total_formatted: formatRub(13370000),
          available: true, available_qty: 3, problem: null,
        }],
        subtotal: 13370000, subtotal_formatted: formatRub(13370000),
        delivery_price: 0, total: 13370000, total_formatted: formatRub(13370000),
        can_checkout: true, price_tier: "retail",
      },
    });
  });

  it("одобренное ателье → price_tier atelier (цену подставляет getCartProducts)", async () => {
    const { POST } = setup({ getCatalogContext: async () => ({ atelierId: "at-1" }) });
    assert.equal(((await (await POST(req())).json()) as { data: { price_tier: string } }).data.price_tier, "atelier");
  });

  it("500 при исключении из getCartProducts: текст 3.0, без stack; лог — структурой", async () => {
    const log = mock.method(console, "error", () => {});
    const { POST } = setup({ getCartProducts: async () => { throw new Error("products.cart: PGRST301 boom"); } });
    const res = await POST(req());
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { error: { code: "INTERNAL_ERROR", message: "Что-то пошло не так. Мы уже разбираемся" } });
    assert.doesNotMatch(text, /stack|boom|PGRST|at /);
    assert.equal(log.mock.callCount(), 1);
    const entry = log.mock.calls[0].arguments[0] as { scope: string; err: unknown };
    assert.equal(entry.scope, "cart.validate");
    assert.ok(entry.err instanceof Error);
  });

  it("Cache-Control: private, no-store на 200/400/403/429/500", async () => {
    mock.method(console, "error", () => {});
    const cases: Array<[number, Response]> = [
      [200, await setup().POST(req())],
      [400, await setup().POST(req(JSON.stringify({ items: [] })))],
      [403, await setup({ assertSameOrigin: forbid }).POST(req())],
      [429, await setup({ limitCart: async () => rateLimitedResponse(60) }).POST(req())],
      [500, await setup({ getCartProducts: async () => { throw new Error("boom"); } }).POST(req())],
    ];
    for (const [status, res] of cases) {
      assert.equal(res.status, status);
      assert.equal(res.headers.get("Cache-Control"), NO_STORE, String(status));
    }
  });
});
