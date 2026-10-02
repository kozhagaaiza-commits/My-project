import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Db } from "@/lib/catalog/db";
import { PRIVACY_POLICY_VERSION } from "@/lib/config";
import {
  ORDER_ACCESS_COLUMNS, ORDER_IDEMPOTENCY_COLUMNS, ORDER_STATE_COLUMNS, buildCreateOrderParams, countActiveReservationsByEmail,
  escapeLike, rpcCancelExpiredOrders, rpcCreateOrder, selectOrderByClientRequestId, selectOrderForAccess, selectOrderState,
} from "@/lib/orders/db";
import { DbError, classifyCreateOrderError, isRetryableDbError } from "@/lib/orders/errors";
import { createOrderBody } from "@/lib/schemas/orders";

// Мок supabase-js: from().select().eq()/ilike()/gt()/neq()/maybeSingle() — thenable; журнал вызовов.
type Call = [string, ...unknown[]];
interface Res { data?: unknown; count?: number | null; error: { message: string; code?: string } | null }

function mockDb(table: Res = { data: null, error: null }, rpc: Record<string, Res> = {}) {
  const calls: Call[] = [];
  const rpcCalls: unknown[][] = [];
  const db = {
    from(name: string) {
      calls.push(["from", name]);
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "ilike", "gt", "neq", "maybeSingle"]) {
        b[m] = (...args: unknown[]) => { calls.push([m, ...args]); return b; };
      }
      b.then = (ok: (r: Res) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(table).then(ok, fail);
      return b;
    },
    async rpc(...args: unknown[]) {
      rpcCalls.push(args);
      return rpc[String(args[0])] ?? { data: null, error: null };
    },
  } as unknown as Db;
  return { db, calls, rpcCalls };
}

const CRID = "0e7c4a19-5b2d-4f8e-9a63-1d0c8b7e2f45";
const W = "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51";
const ORDER_ID = "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68";
const HASH = "a".repeat(64);

/** Запрос из примера Блока 3. */
const BLUEPRINT_BODY = {
  client_request_id: CRID,
  items: [{ product_id: W, quantity: 1 }],
  expected_total: 13370000,
  customer: { name: "Артём Соколов", phone: "+7 916 555-12-34", email: "Artem.Sokolov@Yandex.ru" },
  delivery: { method: "cdek_pvz", city: "Казань", cdek_pvz_code: "kzn45", address: null, postal_code: null },
  vehicle_id: "6f2d8a41-9c3e-4b75-a0d2-3e8f1c7b9d64",
  vin: "wbaja11050b123456",
  comment: "Позвоните перед отправкой",
  consent_pd: true,
  consent_offer: true,
};

describe("buildCreateOrderParams (p_order по комментарию 2.14)", () => {
  it("пример Блока 3: нормализованные поля, ровно ключи p_order, без лишних", () => {
    const body = createOrderBody.parse(BLUEPRINT_BODY);
    const params = buildCreateOrderParams(body, { userId: null, atelierId: null }, HASH);
    assert.deepEqual(params, {
      p_order: {
        client_request_id: CRID, public_token_hash: HASH, user_id: null, atelier_id: null,
        customer_name: "Артём Соколов", customer_phone: "+79165551234", customer_email: "artem.sokolov@yandex.ru",
        delivery_method: "cdek_pvz", delivery_city: "Казань", delivery_address: null, delivery_postal_code: null,
        cdek_pvz_code: "KZN45", vehicle_id: "6f2d8a41-9c3e-4b75-a0d2-3e8f1c7b9d64", vin: "WBAJA11050B123456",
        customer_comment: "Позвоните перед отправкой", consent_policy_version: PRIVACY_POLICY_VERSION, expected_total: 13370000,
      },
      p_items: [{ product_id: W, quantity: 1 }],
    });
  });

  it("курьер по Москве, пустой комментарий → null; user_id и atelier_id — из аргумента", () => {
    const body = createOrderBody.parse({
      ...BLUEPRINT_BODY, comment: "   ", vin: null, vehicle_id: null,
      delivery: { method: "moscow_courier", city: "Москва", address: "ул. Тверская, д. 1, кв. 2", postal_code: null, cdek_pvz_code: null },
    });
    const { p_order } = buildCreateOrderParams(body, { userId: "u-1", atelierId: "at-1" }, HASH);
    assert.equal(p_order.customer_comment, null);
    assert.equal(p_order.delivery_address, "ул. Тверская, д. 1, кв. 2");
    assert.equal(p_order.cdek_pvz_code, null);
    assert.equal(p_order.user_id, "u-1");
    assert.equal(p_order.atelier_id, "at-1");
  });
});

describe("запросы к orders: явные колонки, без select(*)", () => {
  it("колонки не содержат * ; служебные — только public_token_hash для сверки", () => {
    for (const cols of [ORDER_ACCESS_COLUMNS, ORDER_STATE_COLUMNS, ORDER_IDEMPOTENCY_COLUMNS]) {
      assert.doesNotMatch(cols, /\*|admin_note|attention|telegram_chat_id|customer_/);
    }
  });

  it("rpc create_order: аргументы p_order/p_items, одна строка ответа", async () => {
    const created = { order_id: ORDER_ID, order_number: "FC-26-000123", order_total: 13370000, order_kind: "stock" };
    const { db, rpcCalls } = mockDb(undefined, { create_order: { data: [created], error: null } });
    const params = buildCreateOrderParams(createOrderBody.parse(BLUEPRINT_BODY), { userId: null, atelierId: null }, HASH);
    assert.deepEqual(await rpcCreateOrder(db, params), created);
    assert.deepEqual(rpcCalls, [["create_order", { p_order: params.p_order, p_items: params.p_items }]]);
  });

  it("rpc create_order: ошибка Postgres → DbError с кодом и message", async () => {
    const { db } = mockDb(undefined, { create_order: { data: null, error: { code: "P0001", message: `OUT_OF_STOCK:${W}` } } });
    const params = buildCreateOrderParams(createOrderBody.parse(BLUEPRINT_BODY), { userId: null, atelierId: null }, HASH);
    await assert.rejects(rpcCreateOrder(db, params), (e: unknown) => e instanceof DbError && e.pgCode === "P0001" && e.pgMessage === `OUT_OF_STOCK:${W}`);
  });

  it("selectOrderForAccess / selectOrderState / selectOrderByClientRequestId — колонки и фильтры", async () => {
    const access = mockDb({ data: null, error: null });
    assert.equal(await selectOrderForAccess(access.db, "FC-26-000123"), null);
    assert.deepEqual(access.calls, [["from", "orders"], ["select", ORDER_ACCESS_COLUMNS], ["eq", "number", "FC-26-000123"], ["maybeSingle"]]);

    const state = mockDb({ data: { id: ORDER_ID, status: "pending_payment", reserved_until: "2026-10-01T13:00:00+00:00" }, error: null });
    assert.deepEqual(await selectOrderState(state.db, ORDER_ID), { id: ORDER_ID, status: "pending_payment", reserved_until: "2026-10-01T13:00:00+00:00" });
    assert.deepEqual(state.calls[2], ["eq", "id", ORDER_ID]);

    const idem = mockDb({ data: { id: ORDER_ID, number: "FC-26-000123", total: 13370000, kind: "stock" }, error: null });
    assert.deepEqual(await selectOrderByClientRequestId(idem.db, CRID), { order_id: ORDER_ID, order_number: "FC-26-000123", order_total: 13370000, order_kind: "stock" });
    assert.deepEqual(idem.calls.slice(1, 3), [["select", ORDER_IDEMPOTENCY_COLUMNS], ["eq", "client_request_id", CRID]]);
  });

  it("BR-18: count exact/head, ILIKE по email, pending_payment, reserved_until > now, без текущего client_request_id", async () => {
    const now = new Date("2026-10-01T12:30:00.000Z");
    const { db, calls } = mockDb({ count: 2, error: null });
    assert.equal(await countActiveReservationsByEmail(db, "ivan_petrov@mail.ru", { excludeClientRequestId: CRID, now }), 2);
    assert.deepEqual(calls, [
      ["from", "orders"], ["select", "id", { count: "exact", head: true }], ["ilike", "customer_email", "ivan\\_petrov@mail.ru"],
      ["eq", "status", "pending_payment"], ["gt", "reserved_until", "2026-10-01T12:30:00.000Z"], ["neq", "client_request_id", CRID],
    ]);
  });

  it("escapeLike экранирует %, _ и \\", () => {
    assert.equal(escapeLike("a%b_c\\d"), "a\\%b\\_c\\\\d");
  });

  it("ошибка PostgREST → DbError; нет count → исключение", async () => {
    await assert.rejects(countActiveReservationsByEmail(mockDb({ error: { message: "boom", code: "PGRST301" } }).db, "a@b.ru",
      { excludeClientRequestId: CRID, now: new Date() }), DbError);
    await assert.rejects(countActiveReservationsByEmail(mockDb({ count: null, error: null }).db, "a@b.ru",
      { excludeClientRequestId: CRID, now: new Date() }), /count missing/);
  });

  it("rpc cancel_expired_orders → число", async () => {
    const { db, rpcCalls } = mockDb(undefined, { cancel_expired_orders: { data: 2, error: null } });
    assert.equal(await rpcCancelExpiredOrders(db), 2);
    assert.deepEqual(rpcCalls, [["cancel_expired_orders"]]);
  });
});

describe("classifyCreateOrderError / isRetryableDbError", () => {
  const pg = (code: string, message: string) => new DbError("rpc.create_order", code, message);

  it("все исключения P0001 из 2.14", () => {
    for (const k of ["EMPTY_CART", "TOO_MANY_LINES", "DUPLICATE_ITEMS", "MIXED_KINDS", "PRICE_CHANGED"] as const) {
      assert.deepEqual(classifyCreateOrderError(pg("P0001", k)), { kind: k });
    }
    for (const k of ["PRODUCT_UNAVAILABLE", "QTY_LIMIT", "OUT_OF_STOCK"] as const) {
      assert.deepEqual(classifyCreateOrderError(pg("P0001", `${k}:${W.toUpperCase()}`)), { kind: k, productId: W });
    }
  });

  it("чужой код, неизвестный текст, не DbError → null (→ 500)", () => {
    assert.equal(classifyCreateOrderError(pg("23514", "PRICE_CHANGED")), null);
    assert.equal(classifyCreateOrderError(pg("P0001", "OUT_OF_STOCK:not-a-uuid")), null);
    assert.equal(classifyCreateOrderError(pg("P0001", "PRICE_CHANGED_X")), null);
    assert.equal(classifyCreateOrderError(new Error("P0001 PRICE_CHANGED")), null);
  });

  it("повтор: 40P01, 40001, 23505; остальное — нет", () => {
    assert.equal(isRetryableDbError(pg("40P01", "deadlock detected")), true);
    assert.equal(isRetryableDbError(pg("40001", "could not serialize access")), true);
    assert.equal(isRetryableDbError(pg("23505", "duplicate key value violates unique constraint")), true);
    assert.equal(isRetryableDbError(pg("P0001", "OUT_OF_STOCK")), false);
    assert.equal(isRetryableDbError(new Error("40P01")), false);
  });
});
