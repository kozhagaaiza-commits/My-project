import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { z } from "zod";
import { POSTGREST_MAX_ROWS, one, rows, rpcReservedQtyMap, type Db } from "@/lib/catalog/db";

const schema = z.object({ id: z.string() });

describe("rows / one: разбор ответов PostgREST", () => {
  afterEach(() => mock.restoreAll());

  it("ошибка БД → исключение с scope и кодом", () => {
    assert.throws(() => rows(schema, { data: null, error: { message: "boom", code: "PGRST301" } }, "products.list"), /products\.list: PGRST301 boom/);
    assert.throws(() => one(schema, { data: null, error: { message: "boom" } }, "products.bySlug"), /products\.bySlug/);
  });
  it("пустой и null-результат → пустой массив / null", () => {
    assert.deepEqual(rows(schema, { data: [], error: null }, "x"), []);
    assert.deepEqual(rows(schema, { data: null, error: null }, "x"), []);
    assert.equal(one(schema, { data: null, error: null }, "x"), null);
  });
  it("строка неверной формы отклоняется Zod (numeric/null не проходят молча)", () => {
    assert.throws(() => rows(schema, { data: [{ id: 5 }], error: null }, "x"));
  });
  it(`≥ ${POSTGREST_MAX_ROWS} строк: результат отдаётся, но в лог пишется предупреждение об обрезке`, () => {
    const err = mock.method(console, "error", () => {});
    const data = Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => ({ id: String(i) }));
    assert.equal(rows(schema, { data, error: null }, "products.list").length, POSTGREST_MAX_ROWS);
    assert.equal(err.mock.callCount(), 1);
    assert.match(JSON.stringify(err.mock.calls[0].arguments[0]), /max-rows/);
  });
  it("меньше лимита — без предупреждения", () => {
    const err = mock.method(console, "error", () => {});
    rows(schema, { data: [{ id: "a" }], error: null }, "x");
    assert.equal(err.mock.callCount(), 0);
  });
});

describe("rpcReservedQtyMap: брони одним RPC без параметров", () => {
  const client = (res: { data: unknown; error: { message: string } | null }) => {
    const calls: unknown[][] = [];
    return { calls, db: { rpc: async (...a: unknown[]) => { calls.push(a); return res; } } as unknown as Db };
  };

  it("вызывает reserved_qty_map без аргументов и собирает карту", async () => {
    const { calls, db } = client({ data: [{ product_id: "w1", reserved: 2 }, { product_id: "c1", reserved: 1 }], error: null });
    const map = await rpcReservedQtyMap(db);
    assert.deepEqual(calls, [["reserved_qty_map"]]);
    assert.deepEqual([...map.entries()].sort(), [["c1", 1], ["w1", 2]]);
  });
  it("пустой результат → пустая карта; ошибка RPC → исключение", async () => {
    assert.equal((await rpcReservedQtyMap(client({ data: [], error: null }).db)).size, 0);
    await assert.rejects(rpcReservedQtyMap(client({ data: null, error: { message: "denied" } }).db), /rpc\.reserved_qty_map/);
  });
});
