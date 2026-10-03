import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAccountOrdersHandler } from "./handler";

const PAGE = { orders: [{
  number: "FC-26-000131", created_at: "2026-10-05T09:12:00.000Z", status: "paid", status_label: "Оплачен", kind: "preorder" as const,
  total_formatted: "98 600 ₽", items_count: 1, url: "/orders/FC-26-000131",
}], total: 1, page: 1, per_page: 20 };

const make = (userId: string | null, calls: Array<[string, number]> = []) => createAccountOrdersHandler({
  getUserId: async () => userId,
  listOrders: async (u, p) => { calls.push([u, p]); return PAGE; },
});
const get = (h: ReturnType<typeof make>, qs = "") => h(new Request(`http://localhost:3000/api/account/orders${qs}`));

describe("GET /api/account/orders", () => {
  it("гость → 401 UNAUTHORIZED, список не читается", async () => {
    const calls: Array<[string, number]> = [];
    const res = await get(make(null, calls));
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: { code: "UNAUTHORIZED", message: "Войдите в аккаунт" } });
    assert.equal(calls.length, 0);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
  });
  it("200 { data, meta } как в Блоке 3; user.id только из сессии", async () => {
    const calls: Array<[string, number]> = [];
    const res = await get(make("u-1", calls), "?page=2&user_id=other");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { data: PAGE.orders, meta: { total: 1, page: 1, per_page: 20 } });
    assert.deepEqual(calls, [["u-1", 2]]);
  });
  it("битая страница → 400 VALIDATION_ERROR", async () => {
    const res = await get(make("u-1"), "?page=abc");
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "VALIDATION_ERROR");
  });
  it("сбой БД → 500 без деталей", async () => {
    const h = createAccountOrdersHandler({ getUserId: async () => "u-1", listOrders: async () => { throw new Error("db"); } });
    const res = await get(h);
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error.code, "INTERNAL_ERROR");
  });
});
