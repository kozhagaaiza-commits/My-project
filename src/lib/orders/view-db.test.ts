import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Db } from "@/lib/catalog/db";
import { DbError } from "@/lib/orders/errors";
import {
  ORDER_VIEW_COLUMNS, ORDER_VIEW_HISTORY_COLUMNS, ORDER_VIEW_ITEM_COLUMNS, loadOrderViewData,
} from "@/lib/orders/view-db";

// Слой БД страницы заказа на мок-клиенте supabase-js: явные колонки (без служебных), Zod на строки, без N+1.

type Call = [string, ...unknown[]];
interface Res { data: unknown; error: { message: string; code?: string } | null }

function mockDb(tables: Record<string, Res>) {
  const calls: Array<{ table: string; ops: Call[] }> = [];
  const db = {
    from(table: string) {
      const entry = { table, ops: [] as Call[] };
      calls.push(entry);
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "maybeSingle"]) {
        b[m] = (...args: unknown[]) => { entry.ops.push([m, ...args]); return b; };
      }
      b.then = (ok: (r: Res) => unknown, fail?: (e: unknown) => unknown) =>
        Promise.resolve(tables[table] ?? { data: [], error: null }).then(ok, fail);
      return b;
    },
  } as unknown as Db;
  return { db, calls };
}

const ORDER_ID = "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68";
const P1 = "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51";
const P2 = "9d2a5f3b-6c8e-4f4b-8a23-7b1e4d0c8f62";

const ORDER_ROW = {
  id: ORDER_ID, number: "FC-26-000123", kind: "stock", status: "shipped", delivery_method: "cdek_pvz",
  delivery_city: "Казань", delivery_address: null, cdek_pvz_code: "KZN45", total: 13370000,
  reserved_until: "2026-10-01T13:00:00+00:00", paid_at: "2026-10-01T12:34:10+00:00", expected_ready_at: null,
  shipped_at: "2026-10-02T10:15:00+00:00", delivered_at: null, cancel_reason: null, tracking_number: "1234567890",
  courier_note: null, customer_visible_note: null, telegram_chat_id: 123456789, customer_name: "Артём Соколов",
  customer_email: "artem.sokolov@yandex.ru", customer_phone: "+79165551234",
};

const tables = (over: Record<string, Res> = {}): Record<string, Res> => ({
  orders: { data: ORDER_ROW, error: null },
  order_items: {
    data: [
      { title_snapshot: "M-01 R20", quantity: 1, unit_price: 13370000, line_total: 13370000, product_id: P1 },
      { title_snapshot: "Удалённый", quantity: 1, unit_price: 100, line_total: 100, product_id: null },
      { title_snapshot: "Снят с каталога", quantity: 2, unit_price: 100, line_total: 200, product_id: P2 },
    ],
    error: null,
  },
  products: { data: [{ id: P1, slug: "forged-m01-r20-5x112-graphite" }], error: null },
  order_status_history: { data: [{ to_status: "paid", created_at: "2026-10-01T12:34:10+00:00" }], error: null },
  refunds: { data: [{ amount: 3340000 }, { amount: 100000 }], error: null },
  ...over,
});

describe("loadOrderViewData", () => {
  it("данные страницы: подписка как boolean, слаги одним запросом, сумма succeeded-возвратов", async () => {
    const { db, calls } = mockDb(tables());
    const data = await loadOrderViewData(db, ORDER_ID);
    assert.ok(data);
    assert.equal(data.order.telegram_subscribed, true);
    assert.ok(!("telegram_chat_id" in data.order));
    assert.deepEqual(data.items.map((i) => i.product_slug), ["forged-m01-r20-5x112-graphite", null, null]);
    assert.equal(data.items[0].title, "M-01 R20");
    assert.deepEqual(data.history, [{ to_status: "paid", created_at: "2026-10-01T12:34:10+00:00" }]);
    assert.equal(data.refunded_amount, 3440000);

    // Ровно 5 запросов: orders, order_items, products (один на все позиции), history, refunds.
    assert.deepEqual(calls.map((c) => c.table).sort(), ["order_items", "order_status_history", "orders", "products", "refunds"]);
    const op = (t: string) => calls.find((c) => c.table === t)!.ops;
    assert.deepEqual(op("orders"), [["select", ORDER_VIEW_COLUMNS], ["eq", "id", ORDER_ID], ["maybeSingle"]]);
    assert.deepEqual(op("order_items")[0], ["select", ORDER_VIEW_ITEM_COLUMNS]);
    assert.deepEqual(op("products"), [["select", "id,slug"], ["in", "id", [P1, P2]]]);
    assert.deepEqual(op("order_status_history").slice(0, 2), [["select", ORDER_VIEW_HISTORY_COLUMNS], ["eq", "order_id", ORDER_ID]]);
    assert.deepEqual(op("refunds"), [["select", "amount"], ["eq", "order_id", ORDER_ID], ["eq", "status", "succeeded"]]);
  });

  it("служебные колонки не запрашиваются; select('*') нет", () => {
    for (const col of ["admin_note", "attention_reason", "needs_attention", "public_token_hash", "client_request_id", "*"]) {
      assert.ok(!ORDER_VIEW_COLUMNS.split(",").includes(col), col);
    }
    assert.ok(!ORDER_VIEW_HISTORY_COLUMNS.includes("note"));
    assert.ok(!ORDER_VIEW_HISTORY_COLUMNS.includes("changed_by"));
  });

  it("позиции без product_id — запроса к products нет; возвратов нет — 0", async () => {
    const { db, calls } = mockDb(tables({
      order_items: { data: [{ title_snapshot: "x", quantity: 1, unit_price: 1, line_total: 1, product_id: null }], error: null },
      refunds: { data: [], error: null },
    }));
    const data = await loadOrderViewData(db, ORDER_ID);
    assert.equal(data?.refunded_amount, 0);
    assert.ok(!calls.some((c) => c.table === "products"));
  });

  it("chat_id строкой (bigint) — тоже подписка; null — нет", async () => {
    const s = await loadOrderViewData(mockDb(tables({ orders: { data: { ...ORDER_ROW, telegram_chat_id: "9007199254740993" }, error: null } })).db, ORDER_ID);
    assert.equal(s?.order.telegram_subscribed, true);
    const n = await loadOrderViewData(mockDb(tables({ orders: { data: { ...ORDER_ROW, telegram_chat_id: null }, error: null } })).db, ORDER_ID);
    assert.equal(n?.order.telegram_subscribed, false);
  });

  it("заказа нет → null", async () => {
    assert.equal(await loadOrderViewData(mockDb(tables({ orders: { data: null, error: null } })).db, ORDER_ID), null);
  });

  it("ошибка PostgREST → DbError со scope", async () => {
    const { db } = mockDb(tables({ order_status_history: { data: null, error: { message: "permission denied", code: "42501" } } }));
    await assert.rejects(loadOrderViewData(db, ORDER_ID), (e: unknown) => e instanceof DbError && e.scope === "order_status_history.view" && e.pgCode === "42501");
  });

  it("строка не по схеме → исключение Zod (→ 500), а не молчаливый каст", async () => {
    const { db } = mockDb(tables({ orders: { data: { ...ORDER_ROW, status: "weird" }, error: null } }));
    await assert.rejects(loadOrderViewData(db, ORDER_ID));
  });
});
