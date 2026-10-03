import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAdminFixtureStore, handleAdminFixtureRequest, touchProduct, productId } from "./index";
import { buildProductBody } from "@/lib/admin-products-ui/product-form-body";
import { EMPTY_PRODUCT_VALUES, EMPTY_WHEEL } from "@/lib/admin-products-ui/product-form-values";

const call = (store: ReturnType<typeof createAdminFixtureStore>, method: string, url: string, json: unknown = null) =>
  handleAdminFixtureRequest(store, { method, url, json });
const data = (r: { body: unknown }) => (r.body as { data: Record<string, unknown> & unknown[] }).data;
const err = (r: { body: unknown }) => (r.body as { error: { code: string; details?: { suggestion?: string } } }).error;

const newBody = (over: Record<string, unknown> = {}) => ({
  ...buildProductBody({
    ...EMPTY_PRODUCT_VALUES, title: "Тест", manufacturer: "ForgeCarbon", sku: "tst-001", slug: "tst-001", stock_qty: "2", purchase_cost: "800.00",
    wheel: { ...EMPTY_WHEEL, diameter_in: "20", width_front_in: "8.5", et_front_mm: "30", pcd: "5x112", center_bore_mm: "66.6", seat_type: "cone60", construction: "cast" },
  }, "draft"),
  ...over,
});

describe("фикстуры /api/admin/*", () => {
  it("список товаров: фильтр по типу, пагинация по 20, формат строки", () => {
    const store = createAdminFixtureStore();
    const r = call(store, "GET", "/api/admin/products?type=wheel_set&page=2");
    assert.equal(r.status, 200);
    const meta = (r.body as { meta: { total: number; per_page: number } }).meta;
    assert.equal(meta.per_page, 20);
    assert.ok(meta.total > 20);
    const first = call(store, "GET", "/api/admin/products?type=carbon_part");
    assert.equal(data(first).length, 5);
    assert.match(String((data(first)[0] as { price_formatted: string }).price_formatted), /₽/);
  });
  it("создание: валидация, SLUG_TAKEN с suggestion, SKU_TAKEN, RATE_NOT_LOADED", () => {
    const store = createAdminFixtureStore({ withoutCnyRate: true });
    assert.equal(call(store, "POST", "/api/admin/products", {}).status, 400);
    const slug = call(store, "POST", "/api/admin/products", newBody({ slug: "taken-slug" }));
    assert.equal(err(slug).code, "SLUG_TAKEN");
    assert.equal(err(slug).details?.suggestion, "taken-slug-2");
    assert.equal(err(call(store, "POST", "/api/admin/products", newBody({ sku: "FCF-001-R20" }))).code, "SKU_TAKEN");
    assert.equal(err(call(store, "POST", "/api/admin/products", newBody({ purchase_currency: "CNY" }))).code, "RATE_NOT_LOADED");
    const created = call(store, "POST", "/api/admin/products", newBody());
    assert.equal(created.status, 201);
    assert.equal(call(store, "POST", "/api/admin/exchange-rates/refresh", {}).status, 200);
    assert.equal(call(store, "POST", "/api/admin/products", newBody({ slug: "tst-cny", sku: "TST-CNY", purchase_currency: "CNY" })).status, 201);
  });
  it("PATCH: устаревший updated_at → CONFLICT; публикация без фото → 400 images", () => {
    const store = createAdminFixtureStore();
    const id = productId(18); // draft
    const detail = data(call(store, "GET", `/api/admin/products/${id}`)) as unknown as { updated_at: string; images: unknown[] };
    const noPhoto = productId(20);
    const d20 = data(call(store, "GET", `/api/admin/products/${noPhoto}`)) as unknown as { updated_at: string; images: unknown[] };
    assert.equal(d20.images.length, 0);
    const publish = call(store, "PATCH", `/api/admin/products/${noPhoto}`, { status: "active", updated_at: d20.updated_at });
    assert.equal(publish.status, 400);
    touchProduct(store, id);
    assert.equal(err(call(store, "PATCH", `/api/admin/products/${id}`, { status: "draft", updated_at: detail.updated_at })).code, "CONFLICT");
  });
  it("удаление: товар из заказов → 409; фото: лимит 8", () => {
    const store = createAdminFixtureStore();
    const del = call(store, "DELETE", `/api/admin/products/${productId(2)}`);
    assert.equal(del.status, 409);
    const id = productId(1);
    for (let i = 0; i < 5; i++) assert.equal(call(store, "POST", `/api/admin/products/${id}/images`).status, 201);
    assert.equal(err(call(store, "POST", `/api/admin/products/${id}/images`)).code, "IMAGES_LIMIT");
  });
  it("автомобили: фильтр, дубликат → CONFLICT, PATCH возвращает fitting_products_count", () => {
    const store = createAdminFixtureStore();
    const list = call(store, "GET", "/api/admin/vehicles?make=BMW");
    assert.ok(data(list).every((v) => (v as { make: string }).make === "BMW"));
    const g30 = data(list).find((v) => (v as { generation: string }).generation === "G30") as { id: string };
    const patched = call(store, "PATCH", `/api/admin/vehicles/${g30.id}`, { et_max_mm: 42 });
    assert.equal(typeof data(patched).fitting_products_count, "number");
    const row = data(list)[0] as Record<string, unknown>;
    const { id: _id, fitting_products_count: _c, ...body } = row;
    void _id; void _c;
    assert.equal(err(call(store, "POST", "/api/admin/vehicles", body)).code, "CONFLICT");
  });
});
