import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ORDER_NOT_PAYABLE_MESSAGE, PAYMENT_UNAVAILABLE_MESSAGE, PAY_NETWORK_MESSAGE, fetchOrderView, isOrderView,
  orderUrl, requestPay, resolvePayResponse,
} from "@/lib/order-page-api";
import { getFixtureOrderView } from "@/lib/order-page-fixtures";
import type { NavigationEnv } from "@/lib/checkout-response";

const TOKEN = "Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU";
const PROD: NavigationEnv = { production: true, origin: "https://forgecarbon.vercel.app" };
const DEV: NavigationEnv = { production: false, origin: "http://localhost:3000" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const VIEW = (() => {
  const r = getFixtureOrderView("FC-26-000001", "FixtureTokenAaBbCc0123456789_-xY");
  if (r.kind !== "ok") throw new Error("fixture");
  return r.view;
})();

describe("orderUrl", () => {
  it("номер и токен кодируются, без токена — без ?t", () => {
    assert.equal(orderUrl("FC-26-000123", TOKEN), `/api/orders/FC-26-000123?t=${TOKEN}`);
    assert.equal(orderUrl("FC-26-000123", TOKEN, "/pay"), `/api/orders/FC-26-000123/pay?t=${TOKEN}`);
    assert.equal(orderUrl("FC-26-000123", null), "/api/orders/FC-26-000123");
  });
});

describe("fetchOrderView (опрос)", () => {
  it("200 { data: OrderView } → ok", async () => {
    const res = await fetchOrderView("FC-26-000001", TOKEN, { fetchImpl: async () => json(200, { data: VIEW }) });
    assert.deepEqual(res, { ok: true, view: VIEW });
  });
  it("404, 500, не JSON, чужая форма, сеть → ok: false", async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => json(404, { error: { code: "NOT_FOUND", message: "Заказ не найден" } }),
      async () => json(500, {}),
      async () => new Response("<html>", { status: 200 }),
      async () => json(200, { data: { number: 1 } }),
      async () => { throw new TypeError("network"); },
    ];
    for (const fetchImpl of cases) assert.deepEqual(await fetchOrderView("FC-26-000001", TOKEN, { fetchImpl }), { ok: false });
  });
  it("429 → rateLimited с Retry-After (по умолчанию 5 с, максимум 15 с)", async () => {
    const limited = (headers: Record<string, string>) => async () =>
      new Response("{}", { status: 429, headers });
    assert.deepEqual(
      await fetchOrderView("FC-26-000001", TOKEN, { fetchImpl: limited({ "Retry-After": "8" }) }),
      { ok: false, rateLimited: true, retryAfterMs: 8000 },
    );
    assert.deepEqual(
      await fetchOrderView("FC-26-000001", TOKEN, { fetchImpl: limited({}) }),
      { ok: false, rateLimited: true, retryAfterMs: 5000 },
    );
    assert.deepEqual(
      await fetchOrderView("FC-26-000001", TOKEN, { fetchImpl: limited({ "Retry-After": "300" }) }),
      { ok: false, rateLimited: true, retryAfterMs: 15000 },
    );
  });
  it("isOrderView отбрасывает неполные объекты", () => {
    assert.equal(isOrderView(VIEW), true);
    assert.equal(isOrderView(null), false);
    assert.equal(isOrderView({ ...VIEW, items: null }), false);
  });
});

describe("resolvePayResponse", () => {
  const url = "https://yoomoney.ru/checkout/payments/v2/contract?orderId=30a8d2c7";
  it("200 → переход по confirmation_url", () => {
    assert.deepEqual(resolvePayResponse(200, { data: { confirmation_url: url } }, PROD), { type: "redirect", url });
  });
  it("небезопасная ссылка не открывается (http в production, javascript:)", () => {
    for (const bad of ["http://yoomoney.ru/pay", "javascript:alert(1)", "", null]) {
      assert.deepEqual(resolvePayResponse(200, { data: { confirmation_url: bad } }, PROD), { type: "toast", message: PAYMENT_UNAVAILABLE_MESSAGE });
    }
  });
  it("http допустим только вне production", () => {
    assert.equal(resolvePayResponse(200, { data: { confirmation_url: "http://localhost:4000/pay" } }, DEV).type, "redirect");
  });
  it("409 ORDER_NOT_PAYABLE → expired с текстом сервера", () => {
    assert.deepEqual(
      resolvePayResponse(409, { error: { code: "ORDER_NOT_PAYABLE", message: ORDER_NOT_PAYABLE_MESSAGE } }),
      { type: "expired", message: ORDER_NOT_PAYABLE_MESSAGE },
    );
  });
  it("502 и 500 → toast про платёжный сервис", () => {
    assert.deepEqual(
      resolvePayResponse(502, { error: { code: "PAYMENT_PROVIDER_ERROR", message: "x" } }),
      { type: "toast", message: PAYMENT_UNAVAILABLE_MESSAGE },
    );
    assert.equal(resolvePayResponse(500, null).type, "toast");
  });
  it("404 / 403 / 429 → toast", () => {
    assert.deepEqual(resolvePayResponse(404, { error: { code: "NOT_FOUND", message: "Заказ не найден" } }), { type: "toast", message: "Заказ не найден" });
    assert.equal(resolvePayResponse(403, { error: { code: "FORBIDDEN", message: "x" } }).type, "toast");
    assert.deepEqual(resolvePayResponse(429, { error: { code: "RATE_LIMITED", message: "Слишком много запросов" } }), { type: "toast", message: "Слишком много запросов" });
  });
});

describe("requestPay", () => {
  it("POST на /pay с токеном и пустым телом", async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const out = await requestPay("FC-26-000004", TOKEN, {
      env: PROD,
      fetchImpl: async (url, init) => {
        seen = { url, init };
        return json(200, { data: { confirmation_url: "https://yoomoney.ru/pay/1" } });
      },
    });
    assert.deepEqual(out, { type: "redirect", url: "https://yoomoney.ru/pay/1" });
    assert.equal(seen!.url, `/api/orders/FC-26-000004/pay?t=${TOKEN}`);
    assert.equal(seen!.init?.method, "POST");
    assert.equal(seen!.init?.body, "{}");
  });
  it("сеть → toast", async () => {
    const out = await requestPay("FC-26-000004", TOKEN, { fetchImpl: async () => { throw new TypeError("x"); } });
    assert.deepEqual(out, { type: "toast", message: PAY_NETWORK_MESSAGE });
  });
});
