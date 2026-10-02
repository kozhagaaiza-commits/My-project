import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateCart } from "@/lib/cart-api";

const items = [{ product_id: "20000000-0000-4000-8000-000000000001", quantity: 1 }];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const OK = { data: { kind: "stock", items: [], subtotal: 0, subtotal_formatted: "0 ₽", delivery_price: 0, total: 0, total_formatted: "0 ₽", can_checkout: true, price_tier: "retail" } };

describe("validateCart (клиент POST /api/cart/validate)", () => {
  it("шлёт JSON { items: [{ product_id, quantity }] } и возвращает data", async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const res = await validateCart([{ ...items[0], price_seen: 1 } as never], {
      fetchImpl: async (url, init) => { seen = { url, init }; return json(OK); },
    });
    assert.equal(res.ok, true);
    assert.equal(seen!.url, "/api/cart/validate");
    assert.equal(seen!.init?.method, "POST");
    assert.deepEqual(seen!.init?.headers, { "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(String(seen!.init?.body)), { items });
  });
  it("{ error } → kind api с текстом из ответа", async () => {
    const res = await validateCart(items, { fetchImpl: async () => json({ error: { code: "RATE_LIMITED", message: "Слишком много запросов" } }, 429) });
    assert.deepEqual(res, { ok: false, kind: "api", status: 429, code: "RATE_LIMITED", message: "Слишком много запросов" });
  });
  it("сеть, не-JSON, 500 без error и неверная форма data → kind network", async () => {
    assert.deepEqual(await validateCart(items, { fetchImpl: async () => { throw new TypeError("fail"); } }), { ok: false, kind: "network" });
    assert.deepEqual(await validateCart(items, { fetchImpl: async () => new Response("<html>", { status: 502 }) }), { ok: false, kind: "network" });
    assert.deepEqual(await validateCart(items, { fetchImpl: async () => json({}, 500) }), { ok: false, kind: "network" });
    assert.deepEqual(await validateCart(items, { fetchImpl: async () => json({ data: { items: 1 } }) }), { ok: false, kind: "network" });
  });
  it("таймаут → kind network", async () => {
    const res = await validateCart(items, {
      timeoutMs: 20,
      fetchImpl: (_url, init) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    });
    assert.deepEqual(res, { ok: false, kind: "network" });
  });
});
