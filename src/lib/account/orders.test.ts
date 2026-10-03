import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { Db } from "@/lib/catalog/db";

let mod: typeof import("@/lib/account/orders");
before(async () => {
  mod = await import("@/lib/account/orders");
});

interface Call { table: string; filters: Array<[string, unknown]>; range?: [number, number]; columns?: string }

function fakeDb(orders: unknown[], items: unknown[], calls: Call[]): Db {
  const builder = (table: string, columns: string) => {
    const call: Call = { table, filters: [], columns };
    calls.push(call);
    const result = () => (table === "orders"
      ? { data: orders, count: 41, error: null }
      : { data: items, count: null, error: null });
    const b: Record<string, unknown> = {
      eq: (k: string, v: unknown) => { call.filters.push([k, v]); return b; },
      in: (k: string, v: unknown) => { call.filters.push([k, v]); return b; },
      order: () => b,
      range: (a: number, z: number) => { call.range = [a, z]; return b; },
      then: (resolve: (v: unknown) => unknown) => resolve(result()),
    };
    return b;
  };
  return { from: (table: string) => ({ select: (columns: string) => builder(table, columns) }) } as unknown as Db;
}

describe("listAccountOrders", () => {
  it("только заказы пользователя, формат Блока 3, число позиций, служебные колонки не запрашиваются", async () => {
    const calls: Call[] = [];
    const db = fakeDb(
      [{ id: "o1", number: "FC-26-000131", created_at: "2026-10-05T09:12:00+00:00", status: "paid", kind: "preorder", total: 9860000 }],
      [{ order_id: "o1" }],
      calls,
    );
    const res = await mod.listAccountOrders(db, "u-1", 3);
    assert.deepEqual(calls[0].filters, [["user_id", "u-1"]]);
    assert.deepEqual(calls[0].range, [40, 59]);
    assert.doesNotMatch(calls[0].columns ?? "", /admin_note|public_token_hash|client_request_id|telegram_chat_id|attention/);
    assert.deepEqual(res.orders[0], {
      number: "FC-26-000131", created_at: "2026-10-05T09:12:00.000Z", status: "paid", status_label: "Оплачен",
      kind: "preorder", total_formatted: res.orders[0].total_formatted, items_count: 1, url: "/orders/FC-26-000131",
    });
    assert.match(res.orders[0].total_formatted, /98\s?600/);
    assert.equal(res.total, 41);
    assert.equal(res.per_page, 20);
  });
  it("пустой список — без запроса позиций", async () => {
    const calls: Call[] = [];
    const res = await mod.listAccountOrders(fakeDb([], [], calls), "u-1", 1);
    assert.equal(calls.length, 1);
    assert.deepEqual(res.orders, []);
  });
});
