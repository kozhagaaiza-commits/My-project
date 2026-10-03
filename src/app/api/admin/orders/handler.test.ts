import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { apiError } from "@/lib/api-error";
import { createListOrdersHandler, type ListOrdersDeps } from "@/app/api/admin/orders/handler";
import { ADMIN_OK } from "@/lib/admin/__fixtures__/fake-orders";
import type { AdminOrderListRow } from "@/lib/admin/orders-db";
import type { AdminOrdersQuery } from "@/lib/schemas/admin-orders";

// GET /api/admin/orders с подменами. Строка списка — дословно пример Блока 3.

const ROW: AdminOrderListRow = {
  id: "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68", number: "FC-26-000123", created_at: "2026-10-01T12:30:41+00:00",
  kind: "stock", status: "paid", price_tier: "retail", customer_name: "Артём Соколов", customer_phone: "+79165551234",
  customer_email: "artem.sokolov@yandex.ru", delivery_method: "cdek_pvz", delivery_city: "Казань", cdek_pvz_code: "KZN45",
  total: 13370000, needs_attention: false, attention_reason: null,
  vehicle: { make: "BMW", model: "5 Series", generation: "G30", year_from: 2017, year_to: 2023 },
};

function setup(over: Partial<ListOrdersDeps> = {}) {
  const calls: string[] = [];
  const queries: AdminOrdersQuery[] = [];
  const deps: ListOrdersDeps = {
    authorize: async () => { calls.push("auth"); return ADMIN_OK; },
    cancelExpiredOrders: async () => { calls.push("cancel"); return 0; },
    listOrders: async (q) => { calls.push("list"); queries.push(q); return { rows: [ROW], total: 41 }; },
    ...over,
  };
  const GET = createListOrdersHandler(deps);
  return { calls, queries, call: (qs = "") => GET(new Request(`http://localhost:3000/api/admin/orders${qs}`)) };
}

const fmt = (s: string) => s.replace(/ | /g, " ");

describe("GET /api/admin/orders", () => {
  afterEach(() => mock.restoreAll());

  it("200 { data, meta } как в Блоке 3; no-store; порядок auth → cancel → list", async () => {
    const { calls, call } = setup();
    const res = await call();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(JSON.parse(fmt(await res.text())), {
      data: [{
        id: "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68", number: "FC-26-000123", created_at: "2026-10-01T12:30:41.000Z",
        kind: "stock", status: "paid", status_label: "Оплачен", price_tier: "retail",
        customer_name: "Артём Соколов", customer_phone: "+79165551234", customer_email: "artem.sokolov@yandex.ru",
        delivery_label: "СДЭК ПВЗ · Казань · KZN45", total: 13370000, total_formatted: "133 700 ₽",
        needs_attention: false, attention_reason: null, vehicle_label: "BMW 5 Series G30 · 2017–2023",
      }],
      meta: { total: 41, page: 1, per_page: 20 },
    });
    assert.deepEqual(calls, ["auth", "cancel", "list"]);
  });

  it("параметры разбираются Zod: status, kind, attention, q (trim), page", async () => {
    const { queries, call } = setup();
    await call("?status=paid&kind=stock&attention=true&q=%20FC-26-0009%20&page=2");
    assert.deepEqual(queries[0], { status: "paid", kind: "stock", attention: true, q: "FC-26-0009", page: 2 });
  });

  it("meta.page отражает запрошенную страницу", async () => {
    const res = await setup().call("?page=3");
    assert.deepEqual(((await res.json()) as { meta: unknown }).meta, { total: 41, page: 3, per_page: 20 });
  });

  for (const qs of ["?status=lost", "?kind=both", "?q=ab", "?page=0", "?attention=maybe"]) {
    it(`400 VALIDATION_ERROR на ${qs}, без БД`, async () => {
      const { calls, call } = setup();
      const res = await call(qs);
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: { code: string; message: string; details: { fields: object } } };
      assert.equal(body.error.code, "VALIDATION_ERROR");
      assert.equal(body.error.message, "Неверные параметры запроса");
      assert.ok(Object.keys(body.error.details.fields).length > 0);
      assert.deepEqual(calls, ["auth"]);
    });
  }

  it("401 и 403 — до любой работы, no-store", async () => {
    for (const r of [apiError("UNAUTHORIZED", "Войдите в аккаунт", 401), apiError("FORBIDDEN", "Недостаточно прав", 403)]) {
      const { calls, call } = setup({ authorize: async () => ({ ok: false, response: r }) });
      const res = await call("?status=lost");
      assert.equal(res.status, r.status);
      assert.equal(res.headers.get("Cache-Control"), "private, no-store");
      assert.deepEqual(calls, []);
    }
  });

  it("сбой ленивой отмены — в лог, список отдаётся", async () => {
    const err = mock.method(console, "error", () => {});
    const res = await setup({ cancelExpiredOrders: async () => { throw new Error("rpc"); } }).call();
    assert.equal(res.status, 200);
    assert.equal((err.mock.calls[0].arguments[0] as { scope: string }).scope, "admin.orders.list.cancelExpired");
  });

  it("ошибка БД → 500 INTERNAL_ERROR", async () => {
    mock.method(console, "error", () => {});
    const res = await setup({ listOrders: async () => { throw new Error("db"); } }).call();
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: { code: "INTERNAL_ERROR", message: "Что-то пошло не так. Мы уже разбираемся" } });
  });
});
