import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAdminProductsRepo, createImageStorage, ilikeTerm } from "@/lib/admin/products/db";
import { recordingClient, type Recorded } from "@/lib/admin/products/__fixtures__/recording-client";
import { ADMIN_LIST_COLUMNS, ADMIN_PRODUCT_COLUMNS, PRODUCT_WRITE_RETURN_COLUMNS } from "@/lib/admin/products/rows";
import { createAdminVehiclesRepo } from "@/lib/admin/vehicles/db";
import { ADMIN_VEHICLE_COLUMNS } from "@/lib/admin/vehicles/repo";
import { DbError } from "@/lib/orders/errors";

// Форма PostgREST/Storage-запросов реальных репозиториев (явные колонки, фильтры, блокировка, клиент сессии
// vs service-role) — на записывающей подмене supabase-js.

const LIST_ROW = {
  id: "p1", type: "wheel_set", slug: "s", sku: "SKU", title: "Т", status: "draft", availability_mode: "stock", stock_qty: 1,
  purchase_currency: "USD", purchase_cost: 1, pricing_mode: "auto", price: 100, price_atelier: null, updated_at: "2026-10-01T00:00:00+00:00",
};
const WRITE_ROW = { id: "p1", slug: "s", status: "draft", price: 100, price_updated_at: "x", updated_at: "y" };

describe("AdminProductsRepo (сессионный клиент)", () => {
  it("listProducts: явные колонки, count exact, фильтры, поиск, сортировка, range", async () => {
    const { client, queries } = recordingClient(() => ({ data: [LIST_ROW], error: null, count: 27 }));
    const repo = createAdminProductsRepo(client, () => { throw new Error("service-role не нужен"); });
    const out = await repo.listProducts({ type: "wheel_set", status: "active", q: "R20, 5×112", page: 2, perPage: 20 });
    assert.equal(out.total, 27);
    assert.deepEqual(queries[0], {
      table: "products",
      calls: [
        ["select", ADMIN_LIST_COLUMNS, { count: "exact" }], ["eq", "type", "wheel_set"], ["eq", "status", "active"],
        ["or", "title.ilike.%R20_ 5×112%,sku.ilike.%R20_ 5×112%,slug.ilike.%R20_ 5×112%"],
        ["order", "created_at", { ascending: false }], ["order", "id"], ["range", 20, 39],
      ],
    });
  });

  it("ilikeTerm экранирует синтаксис or=() и шаблоны", () => {
    assert.equal(ilikeTerm('a,b(c)"d\\e%f*g'), "a_b_c__d_e_f_g");
  });

  it("reservedQty — через service-role RPC reserved_qty_map", async () => {
    const session = recordingClient();
    const service = recordingClient(() => ({ data: [{ product_id: "p1", reserved: 2 }], error: null }));
    const map = await createAdminProductsRepo(session.client, () => service.client).reservedQty();
    assert.equal(map.get("p1"), 2);
    assert.equal(session.queries.length, 0);
    assert.deepEqual(service.queries, [{ table: "rpc:reserved_qty_map", calls: [["rpc"]] }]);
  });

  it("getProduct / updateProduct: колонки и блокировка where id and updated_at", async () => {
    const { client, queries } = recordingClient((q) => ({ data: q.calls.some((c) => c[0] === "update") ? WRITE_ROW : null, error: null }));
    const repo = createAdminProductsRepo(client, () => client);
    assert.equal(await repo.getProduct("p1"), null);
    await repo.updateProduct("p1", "2026-10-01T09:05:00.123456Z", { stock_qty: 6 });
    assert.deepEqual(queries[0].calls, [["select", ADMIN_PRODUCT_COLUMNS], ["eq", "id", "p1"], ["maybeSingle"]]);
    assert.deepEqual(queries[1].calls, [
      ["update", { stock_qty: 6 }], ["eq", "id", "p1"], ["eq", "updated_at", "2026-10-01T09:05:00.123456Z"],
      ["select", PRODUCT_WRITE_RETURN_COLUMNS], ["maybeSingle"],
    ]);
  });

  it("insertProduct: 23505 → DbError с кодом и details (для SLUG_TAKEN/SKU_TAKEN)", async () => {
    const { client } = recordingClient(() => ({ data: null, error: { code: "23505", message: "duplicate key", details: "Key (slug)=(s) already exists." } }));
    await assert.rejects(createAdminProductsRepo(client, () => client).insertProduct({} as never),
      (e: unknown) => e instanceof DbError && e.pgCode === "23505" && /\(slug\)/.test(e.pgMessage));
  });

  it("replaceProductVehicles: upsert ignoreDuplicates + удаление лишних (notIn); пустой список — очистка", async () => {
    const { client, queries } = recordingClient(() => ({ data: null, error: null }));
    const repo = createAdminProductsRepo(client, () => client);
    await repo.replaceProductVehicles("c1", ["v1", "v2"]);
    await repo.replaceProductVehicles("c1", []);
    assert.deepEqual(queries.map((q) => q.calls), [
      [["upsert", [{ product_id: "c1", vehicle_id: "v1" }, { product_id: "c1", vehicle_id: "v2" }], { onConflict: "product_id,vehicle_id", ignoreDuplicates: true }]],
      [["delete"], ["eq", "product_id", "c1"], ["notIn", "vehicle_id", ["v1", "v2"]]],
      [["delete"], ["eq", "product_id", "c1"]],
    ]);
  });

  it("курс, настройки, order_items, slug-кандидаты, автопересчёт — явные колонки и условия", async () => {
    const results: Record<string, unknown> = {
      exchange_rates: { currency: "USD", rate: 83.56, rate_date: "2026-10-01" },
      app_settings: { markup_multiplier: 2, price_rounding_rub: 100 },
    };
    const { client, queries } = recordingClient((q: Recorded) => ({ data: results[q.table] ?? [], error: null }));
    const repo = createAdminProductsRepo(client, () => client);
    assert.equal((await repo.latestRate("USD"))?.rate, 83.56);
    assert.equal((await repo.pricingSettings()).price_rounding_rub, 100);
    assert.equal(await repo.hasOrderItems("p1"), false);
    await repo.takenSlugs("forged-m01");
    await repo.updateAutoPrice("p1", 100, 200, "2026-10-01T00:00:00.000Z");
    assert.deepEqual(queries.map((q) => [q.table, q.calls]), [
      ["exchange_rates", [["select", "currency,rate,rate_date"], ["eq", "currency", "USD"], ["order", "rate_date", { ascending: false }], ["limit", 1], ["maybeSingle"]]],
      ["app_settings", [["select", "markup_multiplier,price_rounding_rub"], ["eq", "id", 1], ["single"]]],
      ["order_items", [["select", "id"], ["eq", "product_id", "p1"], ["limit", 1]]],
      ["products", [["select", "slug"], ["or", "slug.eq.forged-m01,slug.like.forged-m01-*"], ["limit", 1000]]],
      ["products", [["update", { price: 200, price_updated_at: "2026-10-01T00:00:00.000Z" }], ["eq", "id", "p1"], ["eq", "pricing_mode", "auto"], ["eq", "price", 100], ["select", "id"]]],
    ]);
  });
});

describe("ImageStorage (бакет product-images, сессионный клиент)", () => {
  it("upload без upsert с Content-Type; list → полные пути без папок; remove", async () => {
    const { client, queries } = recordingClient((q) => q.calls[0][0] === "list"
      ? { data: [{ id: "1", name: "a.webp" }, { id: null, name: "sub" }], error: null }
      : { data: {}, error: null });
    const s = createImageStorage(client);
    const blob = new Blob(["x"]);
    await s.upload("products/p1/a.webp", blob, "image/webp");
    assert.deepEqual(await s.list("products/p1"), ["products/p1/a.webp"]);
    await s.remove(["products/p1/a.webp"]);
    await s.remove([]);
    assert.deepEqual(queries.map((q) => [q.table, q.calls[0][0], q.calls[0].slice(1)]), [
      ["storage:product-images", "upload", ["products/p1/a.webp", blob, { contentType: "image/webp", upsert: false, cacheControl: "31536000" }]],
      ["storage:product-images", "list", ["products/p1", { limit: 1000 }]],
      ["storage:product-images", "remove", [["products/p1/a.webp"]]],
    ]);
  });
  it("ошибка Storage → исключение", async () => {
    const { client } = recordingClient(() => ({ data: null, error: { message: "new row violates row-level security policy" } }));
    await assert.rejects(createImageStorage(client).upload("p", new Blob([]), "image/png"), /admin\.storage\.upload/);
  });
});

describe("AdminVehiclesRepo", () => {
  it("list (сессия) и find_wheels_for_vehicle (service-role)", async () => {
    const session = recordingClient(() => ({ data: [], error: null, count: 0 }));
    const service = recordingClient(() => ({ data: null, error: null, count: 2 }));
    const repo = createAdminVehiclesRepo(session.client, () => service.client);
    await repo.list({ make: "BMW", q: "5", page: 1, perPage: 20 });
    assert.equal(await repo.fittingWheelsCount("v1"), 2);
    assert.deepEqual(session.queries[0].calls, [
      ["select", ADMIN_VEHICLE_COLUMNS, { count: "exact" }], ["eq", "make", "BMW"], ["or", "model.ilike.%5%,generation.ilike.%5%"],
      ["order", "make"], ["order", "model"], ["order", "year_from"], ["order", "generation"], ["range", 0, 19],
    ]);
    assert.deepEqual(service.queries, [{
      table: "rpc:find_wheels_for_vehicle", calls: [["rpc", { p_vehicle_id: "v1" }, { head: true, count: "exact" }]],
    }]);
  });
  it("fittingWheelsCount: ошибка RPC или нет count → DbError", async () => {
    const failing = recordingClient(() => ({ data: null, error: { message: "permission denied", code: "42501" } }));
    await assert.rejects(createAdminVehiclesRepo(failing.client, () => failing.client).fittingWheelsCount("v1"), DbError);
    const noCount = recordingClient(() => ({ data: null, error: null, count: null }));
    await assert.rejects(createAdminVehiclesRepo(noCount.client, () => noCount.client).fittingWheelsCount("v1"), /count не получен/);
  });
  it("delete → select id (0 строк = 404)", async () => {
    const { client, queries } = recordingClient(() => ({ data: [], error: null }));
    assert.equal(await createAdminVehiclesRepo(client, () => client).delete("v1"), false);
    assert.deepEqual(queries[0].calls, [["delete"], ["eq", "id", "v1"], ["select", "id"]]);
  });
});
