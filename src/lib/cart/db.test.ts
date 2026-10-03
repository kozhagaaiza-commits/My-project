import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CART_PRODUCT_COLUMNS, loadCartProducts } from "@/lib/cart/db";
import type { Db } from "@/lib/catalog/db";

// Мок supabase-js: цепочка from().select().in().eq()/order() — thenable; записывает вызовы, отвечает по таблице.
type Call = [string, ...unknown[]];
interface Res { data: unknown; error: { message: string; code?: string } | null }

function mockDb(tables: Record<string, Res>, rpc: Record<string, Res>) {
  const log: Array<{ table: string; calls: Call[] }> = [];
  const rpcCalls: unknown[][] = [];
  const db = {
    from(table: string) {
      const entry = { table, calls: [] as Call[] };
      log.push(entry);
      const res = tables[table] ?? { data: [], error: null };
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "in", "eq", "order"]) {
        builder[m] = (...args: unknown[]) => { entry.calls.push([m, ...args]); return builder; };
      }
      builder.then = (ok: (r: Res) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, fail);
      return builder;
    },
    async rpc(...args: unknown[]) {
      rpcCalls.push(args);
      return rpc[String(args[0])] ?? { data: [], error: null };
    },
  } as unknown as Db;
  return { db, log, rpcCalls };
}

const W = "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51";
const C = "a3e9c1b7-2d4f-4e8a-b6c0-1f7d9e3a5b28";
const GONE = "9f8e7d6c-5b4a-4c3d-9e2f-1a0b9c8d7e6f";
const SUPABASE = "https://abcdefghijklmnop.supabase.co";

const productRows = [
  { id: W, slug: "forged-m01-r20-5x112-graphite", title: "M-01", type: "wheel_set", availability_mode: "stock",
    stock_qty: 3, price: 13370000, price_atelier: 11800000, status: "active",
    // Если бы закупочные поля попали в ответ БД, Zod-строка и маппинг их отбросят.
    purchase_cost: 4000000, purchase_currency: "CNY", pricing_mode: "auto" },
  { id: C, slug: "bmw-m4-g82-carbon-rear-diffuser", title: "Диффузор", type: "carbon_part", availability_mode: "preorder",
    stock_qty: 0, price: 9860000, price_atelier: null, status: "active" },
];
const images = [
  { product_id: W, storage_path: `products/${W}/b.webp`, alt: "", sort_order: 1 },
  { product_id: W, storage_path: `products/${W}/a.webp`, alt: "", sort_order: 0 },
];

const setup = (over: { products?: Res; reserved?: Res } = {}) => mockDb(
  {
    products: over.products ?? { data: productRows, error: null },
    product_images: { data: images, error: null },
  },
  { reserved_qty_map: over.reserved ?? { data: [{ product_id: W, reserved: 2 }, { product_id: C, reserved: 5 }], error: null } },
);

describe("loadCartProducts (getCartProducts, мок-клиент)", () => {
  it("запрос: явные колонки без purchase_*, .in(id) по уникальным id, только active", async () => {
    const { db, log, rpcCalls } = setup();
    await loadCartProducts(db, [W, C, W, GONE], { atelierId: null }, { supabaseUrl: SUPABASE });
    const products = log.find((l) => l.table === "products");
    assert.ok(products);
    assert.deepEqual(products.calls, [
      ["select", CART_PRODUCT_COLUMNS], ["in", "id", [W, C, GONE]], ["eq", "status", "active"],
    ]);
    assert.doesNotMatch(CART_PRODUCT_COLUMNS, /purchase|pricing_mode|\*/);
    assert.deepEqual(rpcCalls, [["reserved_qty_map"]]);
    const imgs = log.find((l) => l.table === "product_images");
    assert.deepEqual(imgs?.calls[1], ["in", "product_id", [W, C, GONE]]);
  });

  it("розница: unit_price = price; брони вычитаются; preorder → available_qty null; обложка — первое фото", async () => {
    const { db } = setup();
    const res = await loadCartProducts(db, [W, C], { atelierId: null }, { supabaseUrl: `${SUPABASE}/` });
    assert.deepEqual(res, [
      { id: W, slug: "forged-m01-r20-5x112-graphite", title: "M-01", type: "wheel_set", availability_mode: "stock",
        unit_price: 13370000, available_qty: 1,
        cover_image_url: `${SUPABASE}/storage/v1/object/public/product-images/products/${W}/a.webp` },
      { id: C, slug: "bmw-m4-g82-carbon-rear-diffuser", title: "Диффузор", type: "carbon_part", availability_mode: "preorder",
        unit_price: 9860000, available_qty: null, cover_image_url: null },
    ]);
  });

  it("нет закупочных и служебных полей в результате", async () => {
    const { db } = setup();
    const [w] = await loadCartProducts(db, [W], { atelierId: null }, { supabaseUrl: SUPABASE });
    for (const key of ["purchase_cost", "purchase_currency", "pricing_mode", "price_atelier", "price", "stock_qty", "status"]) {
      assert.equal(key in w, false, key);
    }
  });

  it("одобренное ателье + FEATURE_ATELIER: price_atelier ?? price (BR-09/BR-10)", async () => {
    const { db } = setup();
    const res = await loadCartProducts(db, [W, C], { atelierId: "at-1" }, { supabaseUrl: SUPABASE, featureAtelier: true });
    assert.deepEqual(res.map((p) => p.unit_price), [11800000, 9860000]);
  });

  it("ателье при FEATURE_ATELIER=false — розница (BR-20)", async () => {
    const { db } = setup();
    const res = await loadCartProducts(db, [W], { atelierId: "at-1" }, { supabaseUrl: SUPABASE, featureAtelier: false });
    assert.equal(res[0].unit_price, 13370000);
  });

  it("брони больше остатка → available_qty 0 (не отрицательный)", async () => {
    const { db } = setup({ reserved: { data: [{ product_id: W, reserved: 7 }], error: null } });
    const [w] = await loadCartProducts(db, [W], { atelierId: null }, { supabaseUrl: SUPABASE });
    assert.equal(w.available_qty, 0);
  });

  it("draft/archived, просочившиеся из БД, отбрасываются (Edge Case 13)", async () => {
    const { db } = setup({ products: { data: [{ ...productRows[1], status: "archived" }], error: null } });
    assert.deepEqual(await loadCartProducts(db, [C], { atelierId: null }, { supabaseUrl: SUPABASE }), []);
  });

  it("пустой список id → без запросов", async () => {
    const { db, log, rpcCalls } = setup();
    assert.deepEqual(await loadCartProducts(db, [], { atelierId: null }, { supabaseUrl: SUPABASE }), []);
    assert.equal(log.length, 0);
    assert.equal(rpcCalls.length, 0);
  });

  it("ошибка БД и строка неверной формы → исключение со scope", async () => {
    await assert.rejects(
      loadCartProducts(setup({ products: { data: null, error: { message: "boom", code: "PGRST301" } } }).db, [W], { atelierId: null }, { supabaseUrl: SUPABASE }),
      /products\.cart: PGRST301 boom/);
    await assert.rejects(
      loadCartProducts(setup({ products: { data: [{ ...productRows[0], price: "13370000" }], error: null } }).db, [W], { atelierId: null }, { supabaseUrl: SUPABASE }));
    await assert.rejects(
      loadCartProducts(setup({ reserved: { data: null, error: { message: "denied" } } }).db, [W], { atelierId: null }, { supabaseUrl: SUPABASE }),
      /rpc\.reserved_qty_map/);
  });
});
