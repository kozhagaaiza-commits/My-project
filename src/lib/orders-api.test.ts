import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOrder } from "@/lib/orders-api";
import type { CreateOrderBody } from "@/lib/schemas/orders";

const body = { client_request_id: "0e7c4a19-5b2d-4f8e-9a63-1d0c8b7e2f45", expected_total: 13370000 } as unknown as CreateOrderBody;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const CREATED = {
  order_id: "4b9e2c7a", order_number: "FC-26-000123", total: 13370000, total_formatted: "133 700 ₽",
  reserved_until: "2026-10-01T13:00:00.000Z", confirmation_url: "https://yoomoney.ru/c", order_url: "https://x.ru/orders/FC-26-000123?t=1",
};

describe("createOrder (клиент POST /api/orders)", () => {
  it("шлёт JSON-тело на /api/orders и возвращает data", async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const res = await createOrder(body, { fetchImpl: async (url, init) => { seen = { url, init }; return json({ data: CREATED }, 201); } });
    assert.deepEqual(res, { ok: true, data: CREATED });
    assert.equal(seen!.url, "/api/orders");
    assert.equal(seen!.init?.method, "POST");
    assert.deepEqual(seen!.init?.headers, { "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(String(seen!.init?.body)), body);
    assert.equal(seen!.init?.credentials, undefined); // same-origin по умолчанию
  });
  it("{ error } → api с details", async () => {
    const res = await createOrder(body, { fetchImpl: async () => json({ error: { code: "PRICE_CHANGED", message: "Цены изменились", details: { actual_total: 1 } } }, 409) });
    assert.deepEqual(res, { ok: false, kind: "api", status: 409, code: "PRICE_CHANGED", message: "Цены изменились", details: { actual_total: 1 } });
  });
  it("TypeError сети, не-JSON ответ → network", async () => {
    assert.deepEqual(await createOrder(body, { fetchImpl: async () => { throw new TypeError("Failed to fetch"); } }), { ok: false, kind: "network" });
    assert.deepEqual(await createOrder(body, { fetchImpl: async () => new Response("<html>", { status: 504 }) }), { ok: false, kind: "network" });
  });
  it("таймаут → network", async () => {
    const res = await createOrder(body, {
      timeoutMs: 20,
      fetchImpl: (_url, init) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    });
    assert.deepEqual(res, { ok: false, kind: "network" });
  });
  it("внешний abort → network", async () => {
    const controller = new AbortController();
    const pending = createOrder(body, {
      signal: controller.signal,
      fetchImpl: (_url, init) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    });
    controller.abort();
    assert.deepEqual(await pending, { ok: false, kind: "network" });
  });
});
