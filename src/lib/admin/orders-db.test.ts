import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mockDb, selects } from "@/lib/admin/__fixtures__/mock-db";
import {
  ADMIN_HISTORY_COLUMNS, ADMIN_ORDER_DETAIL_COLUMNS, ADMIN_ORDER_LIST_COLUMNS, loadAdminOrderDetail, selectAdminOrders,
} from "@/lib/admin/orders-db";
import { ORDER_CHANGE_COLUMNS, selectOrderForChange, updateOrderMeta, updateOrderStatus } from "@/lib/admin/orders-write";
import { DbError } from "@/lib/orders/errors";
import { adminOrdersQuery } from "@/lib/schemas/admin-orders";

// Слой БД заказов админки на мок-клиенте: явные колонки (никогда *), фильтры и пагинация списка, Zod на строки,
// оптимистическая блокировка в update.

const ORDER_ID = "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68";
const ADMIN = "5d1e7a3c-8b2f-4c6d-9e0a-1f3b5c7d9e21";
const q = (raw: Record<string, string>) => adminOrdersQuery.parse(raw);

const LIST_ROW = {
  id: ORDER_ID, number: "FC-26-000123", created_at: "2026-10-01T12:30:41.123456+00:00", kind: "stock", status: "paid",
  price_tier: "retail", customer_name: "Артём Соколов", customer_phone: "+79165551234", customer_email: "artem.sokolov@yandex.ru",
  delivery_method: "cdek_pvz", delivery_city: "Казань", cdek_pvz_code: "KZN45", total: 13370000, needs_attention: false,
  attention_reason: null, vehicle: { make: "BMW", model: "5 Series", generation: "G30", year_from: 2017, year_to: 2023 },
};

describe("selectAdminOrders", () => {
  it("без фильтров: явные колонки, новые сверху, страница 1 = range(0, 19), count exact", async () => {
    const { db, calls } = mockDb(() => ({ data: [LIST_ROW], count: 41 }));
    const res = await selectAdminOrders(db, q({}));
    assert.equal(res.total, 41);
    assert.equal(res.rows[0].vehicle?.generation, "G30");
    assert.deepEqual(calls[0].ops, [
      ["select", ADMIN_ORDER_LIST_COLUMNS, { count: "exact", head: false }],
      ["order", "created_at", { ascending: false }], ["order", "id", { ascending: false }], ["range", 0, 19],
    ]);
  });

  it("фильтры status, kind, attention=true; страница 3 = range(40, 59)", async () => {
    const { db, calls } = mockDb(() => ({ data: [], count: 0 }));
    await selectAdminOrders(db, q({ status: "paid", kind: "preorder", attention: "true", page: "3" }));
    const ops = calls[0].ops;
    assert.deepEqual(ops.slice(1, 4), [["eq", "status", "paid"], ["eq", "kind", "preorder"], ["eq", "needs_attention", true]]);
    assert.deepEqual(ops.at(-1), ["range", 40, 59]);
  });

  it("attention=false — без фильтра (Switch выключен)", async () => {
    const { db, calls } = mockDb(() => ({ data: [], count: 0 }));
    await selectAdminOrders(db, q({ attention: "false" }));
    assert.ok(!calls[0].ops.some((o) => o[0] === "eq"));
  });

  it("q: email → ilike по подстроке; телефон → or(number, phone) по цифрам", async () => {
    const a = mockDb(() => ({ data: [], count: 0 }));
    await selectAdminOrders(a.db, q({ q: "Artem.Sokolov@Yandex.ru" }));
    assert.deepEqual(a.calls[0].ops[1], ["ilike", "customer_email", "%artem.sokolov@yandex.ru%"]);
    const b = mockDb(() => ({ data: [], count: 0 }));
    await selectAdminOrders(b.db, q({ q: "8 (916) 555-12-34" }));
    assert.deepEqual(b.calls[0].ops[1], ["or", "number.ilike.%89165551234%,customer_phone.ilike.%79165551234%"]);
  });

  it("страница за пределами (PGRST103) → пустой список и total из head-запроса с теми же фильтрами", async () => {
    const { db, calls } = mockDb((_t, ops) => (ops.some((o) => o[0] === "range")
      ? { error: { code: "PGRST103", message: "Requested range not satisfiable" } }
      : { count: 41 }));
    const res = await selectAdminOrders(db, q({ status: "paid", page: "9" }));
    assert.deepEqual(res, { rows: [], total: 41 });
    assert.deepEqual(calls[1].ops, [["select", "id", { count: "exact", head: true }], ["eq", "status", "paid"]]);
  });

  it("ошибка БД → DbError; строка не по схеме → исключение", async () => {
    await assert.rejects(selectAdminOrders(mockDb(() => ({ error: { code: "57014", message: "timeout" } })).db, q({})), DbError);
    await assert.rejects(selectAdminOrders(mockDb(() => ({ data: [{ ...LIST_ROW, status: "weird" }], count: 1 })).db, q({})));
  });
});

describe("loadAdminOrderDetail", () => {
  const tables: Record<string, unknown> = {
    orders: {
      ...LIST_ROW, delivery_address: null, delivery_postal_code: null, vin: null, customer_comment: null,
      tracking_number: null, courier_note: null, admin_note: "секрет", customer_visible_note: null, expected_ready_at: null,
      telegram_chat_id: 987654321, consent_pd_at: "2026-10-01T12:30:41+00:00", consent_policy_version: "2026-10-01",
      updated_at: "2026-10-01T12:34:10+00:00",
    },
    order_items: [],
    payments: [],
    refunds: [],
    order_status_history: [
      { from_status: "paid", to_status: "confirmed", note: "ok", changed_by: ADMIN, created_at: "2026-10-01T15:00:00+00:00" },
      { from_status: null, to_status: "pending_payment", note: null, changed_by: null, created_at: "2026-10-01T12:30:41+00:00" },
    ],
    profiles: [{ id: ADMIN, full_name: " Олег Инженер " }],
  };

  it("карточка: явные колонки, подписка boolean, имена авторов истории одним запросом", async () => {
    const { db, calls } = mockDb((t) => ({ data: tables[t] }));
    const d = await loadAdminOrderDetail(db, ORDER_ID);
    assert.ok(d);
    assert.equal(d.order.telegram_subscribed, true);
    assert.ok(!("telegram_chat_id" in d.order));
    assert.deepEqual(d.history.map((h) => h.changed_by_name), ["Олег Инженер", null]);
    assert.deepEqual(calls.map((c) => c.table).sort(), ["order_items", "order_status_history", "orders", "payments", "profiles", "refunds"]);
    const all = selects(calls);
    assert.ok(all.includes(ADMIN_ORDER_DETAIL_COLUMNS) && all.includes(ADMIN_HISTORY_COLUMNS));
    for (const s of all) {
      assert.ok(!s.includes("*"), s);
      assert.ok(!s.includes("public_token_hash") && !s.includes("client_request_id") && !s.includes("purchase_"), s);
    }
    assert.deepEqual(calls.find((c) => c.table === "profiles")?.ops, [["select", "id,full_name"], ["in", "id", [ADMIN]]]);
  });

  it("нет заказа → null", async () => {
    const { db } = mockDb((t) => ({ data: t === "orders" ? null : [] }));
    assert.equal(await loadAdminOrderDetail(db, ORDER_ID), null);
  });
});

describe("orders-write: блокировка по updated_at", () => {
  it("selectOrderForChange — явные колонки", async () => {
    const { db, calls } = mockDb(() => ({ data: null }));
    assert.equal(await selectOrderForChange(db, ORDER_ID), null);
    assert.deepEqual(calls[0].ops, [["select", ORDER_CHANGE_COLUMNS], ["eq", "id", ORDER_ID], ["maybeSingle"]]);
  });

  it("updateOrderStatus: where id, updated_at, status; 0 строк → null", async () => {
    const { db, calls } = mockDb(() => ({ data: null }));
    const res = await updateOrderStatus(db, ORDER_ID, { updatedAt: "2026-10-01T15:02:44.123456+00:00", fromStatus: "paid" }, { status: "confirmed" });
    assert.equal(res, null);
    assert.deepEqual(calls[0].ops, [
      ["update", { status: "confirmed" }], ["eq", "id", ORDER_ID], ["eq", "updated_at", "2026-10-01T15:02:44.123456+00:00"],
      ["eq", "status", "paid"], ["select", "id,status,updated_at"], ["maybeSingle"],
    ]);
  });

  it("updateOrderMeta: where id, updated_at; ошибка → DbError", async () => {
    const ok = mockDb(() => ({ data: { id: ORDER_ID, expected_ready_at: "2026-11-12", updated_at: "2026-10-20T08:01:12+00:00" } }));
    const row = await updateOrderMeta(ok.db, ORDER_ID, "2026-10-20T08:00:00+00:00", { expected_ready_at: "2026-11-12" });
    assert.equal(row?.expected_ready_at, "2026-11-12");
    assert.deepEqual(ok.calls[0].ops.slice(0, 3), [["update", { expected_ready_at: "2026-11-12" }], ["eq", "id", ORDER_ID], ["eq", "updated_at", "2026-10-20T08:00:00+00:00"]]);
    await assert.rejects(updateOrderMeta(mockDb(() => ({ error: { code: "23514", message: "check" } })).db, ORDER_ID, "x", {}), DbError);
  });
});
