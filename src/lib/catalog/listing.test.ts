import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAtelierPricing, tierPrice, toPublicProduct } from "@/lib/catalog";
import { G30, carbonRow, wheelRow } from "@/lib/catalog/__fixtures__/rows";
import { applyFilters, paginate, pickCovers, sortEntries, toEntries, toListItem } from "@/lib/catalog/listing";
import type { ProductRow } from "@/lib/catalog/rows";

const guest = { atelierId: null };
const mk = (id: string, over: Partial<ProductRow>) => toPublicProduct(wheelRow({ id, slug: id, ...over }), guest);

// a: дорогой в наличии, b: дешёвый нет в наличии (остаток весь в брони), c: средний в наличии новее всех, d: под заказ
const products = [
  mk("a", { price: 300, stock_qty: 2, created_at: "2026-01-01T00:00:00Z", construction: "forged_monoblock", diameter_in: 20 }),
  mk("b", { price: 100, stock_qty: 1, created_at: "2026-03-01T00:00:00Z", construction: "cast", diameter_in: 19 }),
  mk("c", { price: 200, stock_qty: 5, created_at: "2026-04-01T00:00:00Z", construction: "forged_3pc", diameter_in: 21 }),
  mk("d", { price: 150, availability_mode: "preorder", stock_qty: 0, lead_time_min_days: 21, lead_time_max_days: 35, created_at: "2026-02-01T00:00:00Z", construction: "flow_formed", diameter_in: 20 }),
];
// Карта броней приходит готовой из RPC reserved_qty_map (суммирование делает SQL, см. db.test.ts).
const reserved = new Map([["a", 1], ["b", 1]]);
const entries = toEntries(products, reserved, null, null);
const ids = (es: { product: { id: string } }[]) => es.map((e) => e.product.id);

describe("брони и доступность", () => {
  it("available_qty считается с учётом брони", () => {
    assert.equal(entries.find((e) => e.product.id === "a")?.availability.available_qty, 1);
    assert.equal(entries.find((e) => e.product.id === "b")?.availability.status, "out_of_stock");
  });
});

describe("сортировка: in_stock (и preorder) всегда выше out_of_stock", () => {
  for (const sort of ["price_asc", "price_desc", "newest"] as const) {
    it(sort, () => assert.equal(ids(sortEntries(entries, sort)).at(-1), "b"));
  }
  it("внутри группы — по sort", () => {
    assert.deepEqual(ids(sortEntries(entries, "price_asc")), ["d", "c", "a", "b"]);
    assert.deepEqual(ids(sortEntries(entries, "price_desc")), ["a", "c", "d", "b"]);
    assert.deepEqual(ids(sortEntries(entries, "newest")), ["c", "d", "a", "b"]);
  });
});

describe("сортировка по цене ателье (решение владельца, День 3, A26)", () => {
  const atelier = { atelierId: "at-1" };
  // p: розница 300, ателье 100; q: розница 200, ателье не задана (= 200); r: розница 250, ателье 150
  const rowsA = [
    wheelRow({ id: "p", slug: "p", price: 300, price_atelier: 100 }),
    wheelRow({ id: "q", slug: "q", price: 200, price_atelier: null }),
    wheelRow({ id: "r", slug: "r", price: 250, price_atelier: 150 }),
  ];
  const forAtelier = toEntries(rowsA.map((r) => toPublicProduct(r, atelier, true)), new Map(), null, null);
  const forGuest = toEntries(rowsA.map((r) => toPublicProduct(r, guest, true)), new Map(), null, null);

  it("ателье: по price_atelier ?? price", () => {
    assert.deepEqual(ids(sortEntries(forAtelier, "price_asc", true)), ["p", "r", "q"]);
    assert.deepEqual(ids(sortEntries(forAtelier, "price_desc", true)), ["q", "r", "p"]);
  });
  it("без флага (гость, не одобренное ателье, FEATURE_ATELIER=false) — по рознице", () => {
    assert.deepEqual(ids(sortEntries(forAtelier, "price_asc")), ["q", "r", "p"]);
    assert.deepEqual(ids(sortEntries(forGuest, "price_asc", false)), ["q", "r", "p"]);
  });
  it("флаг при скрытой price_atelier (toPublicProduct для гостя) не раскрывает цену ателье — сортировка по рознице", () => {
    assert.deepEqual(ids(sortEntries(forGuest, "price_asc", true)), ["q", "r", "p"]);
  });
  it("newest и правило «нет в наличии — ниже» флаг не меняет", () => {
    assert.deepEqual(ids(sortEntries(entries, "newest", true)), ids(sortEntries(entries, "newest")));
    assert.equal(ids(sortEntries(entries, "price_asc", true)).at(-1), "b");
  });
});

describe("isAtelierPricing / tierPrice", () => {
  it("только одобренное ателье при FEATURE_ATELIER", () => {
    assert.equal(isAtelierPricing({ atelierId: "at-1" }, true), true);
    assert.equal(isAtelierPricing({ atelierId: "at-1" }, false), false);
    assert.equal(isAtelierPricing({ atelierId: null }, true), false);
  });
  it("price_atelier ?? price для ателье, иначе price", () => {
    assert.equal(tierPrice({ price: 300, price_atelier: 100 }, true), 100);
    assert.equal(tierPrice({ price: 300, price_atelier: null }, true), 300);
    assert.equal(tierPrice({ price: 300, price_atelier: 100 }, false), 300);
  });
});

describe("фильтры", () => {
  const base = { type: "wheel_set" as const, availability: "all" as const };
  it("forged = все forged_*", () => assert.deepEqual(ids(applyFilters(entries, { ...base, construction: "forged" })).sort(), ["a", "c"]));
  it("construction cast / flow_formed", () => {
    assert.deepEqual(ids(applyFilters(entries, { ...base, construction: "cast" })), ["b"]);
    assert.deepEqual(ids(applyFilters(entries, { ...base, construction: "flow_formed" })), ["d"]);
  });
  it("diameter", () => assert.deepEqual(ids(applyFilters(entries, { ...base, diameter: 20 })).sort(), ["a", "d"]));
  it("availability=in_stock — только available_qty > 0 (preorder и out_of_stock исключены)", () => {
    assert.deepEqual(ids(applyFilters(entries, { ...base, availability: "in_stock" })).sort(), ["a", "c"]);
  });
  it("diameter/construction для карбона игнорируются", () => {
    const carbon = toEntries([toPublicProduct(carbonRow(), guest)], new Map(), null, null);
    assert.equal(applyFilters(carbon, { type: "carbon_part", availability: "all", diameter: 20, construction: "forged" }).length, 1);
  });
});

describe("пагинация", () => {
  const items = Array.from({ length: 50 }, (_, i) => i);
  it("страницы по 24", () => {
    assert.deepEqual(paginate(items, 1, 24), items.slice(0, 24));
    assert.deepEqual(paginate(items, 3, 24), [48, 49]);
    assert.deepEqual(paginate(items, 4, 24), []);
  });
});

describe("элемент списка", () => {
  it("подбор: только подходящие, fitment с needs_hub_rings; обложка — минимальный sort_order", () => {
    const fits = new Map([["c", true]]);
    const [e] = toEntries(products, reserved, fits, G30.id);
    const covers = pickCovers([
      { product_id: "c", storage_path: "products/c/2.webp", alt: "", sort_order: 1 },
      { product_id: "c", storage_path: "products/c/1.webp", alt: "Вид спереди", sort_order: 0 },
    ]);
    const item = toListItem(e, covers.get("c"), "https://x.supabase.co");
    assert.deepEqual(item.fitment, { vehicle_id: G30.id, fits: true, needs_hub_rings: true });
    assert.equal(item.cover_image?.url, "https://x.supabase.co/storage/v1/object/public/product-images/products/c/1.webp");
    assert.equal(item.cover_image?.alt, "Вид спереди");
    assert.equal(item.price_atelier, null);
    assert.equal(item.price_formatted.replace(/ /g, " "), "2 ₽");
    assert.equal("lead_time" in item.availability, false);
    assert.equal(JSON.stringify(item).includes("purchase"), false);
  });
  it("без vehicle — fitment null, без фото — cover_image null; preorder в списке с lead_time", () => {
    const d = entries.find((e) => e.product.id === "d");
    assert.ok(d);
    const item = toListItem(d, undefined, "https://x.supabase.co");
    assert.equal(item.fitment, null);
    assert.equal(item.cover_image, null);
    assert.deepEqual(item.availability.lead_time, { min_days: 21, max_days: 35 });
  });
});
