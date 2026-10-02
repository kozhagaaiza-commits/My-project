import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  availabilityForList, buildAvailability, buildFastenerNote, buildSpecsShort, formatPrice, publicImageUrl,
  STOCK_DELIVERY_TEXT, toPublicProduct, vehicleLabel,
} from "@/lib/catalog";
import { G30, M4, carbonRow, wheelRow } from "@/lib/catalog/__fixtures__/rows";

const sp = (s: string | null) => s?.replace(/[  ]/g, " ") ?? null;

describe("buildAvailability (US-002)", () => {
  it("stock, available_qty > 0 → in_stock", () => {
    const a = buildAvailability(wheelRow({ stock_qty: 3 }), 0);
    assert.deepEqual(a, {
      mode: "stock", available_qty: 3, status: "in_stock", label: "В наличии в Москве",
      delivery_text: "Москва — 1–2 дня, регионы — 2–5 рабочих дней", lead_time: null,
    });
    assert.equal(STOCK_DELIVERY_TEXT, "Москва — 1–2 дня, регионы — 2–5 рабочих дней");
  });
  it("брони вычитаются; граница: остаток ровно 0 → out_of_stock", () => {
    assert.equal(buildAvailability(wheelRow({ stock_qty: 3 }), 2).available_qty, 1);
    const a = buildAvailability(wheelRow({ stock_qty: 3 }), 3);
    assert.deepEqual(a, { mode: "stock", available_qty: 0, status: "out_of_stock", label: "Нет в наличии", delivery_text: null, lead_time: null });
  });
  it("брони больше остатка → 0, не отрицательное", () => {
    assert.equal(buildAvailability(wheelRow({ stock_qty: 1 }), 2).available_qty, 0);
  });
  it("preorder → срок и 100% предоплата, available_qty null", () => {
    assert.deepEqual(buildAvailability(carbonRow(), 0), {
      mode: "preorder", available_qty: null, status: "preorder", label: "Под заказ",
      delivery_text: "Срок поставки 21–35 дней · 100% предоплата", lead_time: { min_days: 21, max_days: 35 },
    });
  });
  it("в списке lead_time для stock убирается, для preorder остаётся", () => {
    assert.equal("lead_time" in availabilityForList(buildAvailability(wheelRow(), 0)), false);
    assert.deepEqual(availabilityForList(buildAvailability(carbonRow(), 0)).lead_time, { min_days: 21, max_days: 35 });
  });
});

describe("buildSpecsShort", () => {
  it("разноширокий комплект", () => {
    assert.equal(buildSpecsShort(wheelRow()), "R20 · 8.5J/9.5J · 5×112 · ET 30/40 · ЦО 66.6");
  });
  it("одинаковые перед/зад (null и равные значения) → одно значение", () => {
    assert.equal(buildSpecsShort(wheelRow({ diameter_in: 19, width_rear_in: null, et_front_mm: 35, et_rear_mm: null })),
      "R19 · 8.5J · 5×112 · ET 35 · ЦО 66.6");
    assert.equal(buildSpecsShort(wheelRow({ width_rear_in: 8.5, et_rear_mm: 30 })), "R20 · 8.5J · 5×112 · ET 30 · ЦО 66.6");
  });
  it("целые значения без «.0», отрицательный ET", () => {
    assert.equal(buildSpecsShort(wheelRow({ width_front_in: 8, width_rear_in: 9, center_bore_mm: 72.6, pcd: "5x120", et_front_mm: -5, et_rear_mm: null })),
      "R20 · 8J/9J · 5×120 · ET -5 · ЦО 72.6");
  });
  it("карбон → null", () => {
    assert.equal(buildSpecsShort(carbonRow()), null);
  });
});

describe("toPublicProduct (BR-10, BR-13, BR-20)", () => {
  it("нет закупочных полей даже если они пришли в строке", () => {
    const leaky = { ...wheelRow(), purchase_cost: 80000, purchase_currency: "USD", pricing_mode: "auto" };
    const pub = toPublicProduct(leaky, { atelierId: null });
    for (const k of ["purchase_cost", "purchase_currency", "pricing_mode"]) assert.equal(k in pub, false, k);
    assert.equal(JSON.stringify(pub).includes("80000"), false);
  });
  it("price_atelier скрыт для гостя и при FEATURE_ATELIER=false, виден одобренному ателье", () => {
    assert.equal(toPublicProduct(wheelRow(), { atelierId: null }).price_atelier, null);
    assert.equal(toPublicProduct(wheelRow(), { atelierId: "a1" }, false).price_atelier, null);
    assert.equal(toPublicProduct(wheelRow(), { atelierId: "a1" }, true).price_atelier, 11800000);
  });
  it("certifications → [] без claims_verified", () => {
    assert.deepEqual(toPublicProduct(wheelRow({ claims_verified: false }), { atelierId: null }).certifications, []);
    assert.deepEqual(toPublicProduct(wheelRow({ claims_verified: true }), { atelierId: null }).certifications, ["JWL", "VIA"]);
  });
});

describe("форматирование", () => {
  it("цена через formatRub, null → null", () => {
    assert.equal(sp(formatPrice(13370000)), "133 700 ₽");
    assert.equal(sp(formatPrice(5240000)), "52 400 ₽");
    assert.equal(formatPrice(null), null);
  });
  it("label автомобиля", () => {
    assert.equal(vehicleLabel(G30), "BMW 5 Series G30 · 2017–2023");
    assert.equal(vehicleLabel(M4), "BMW M4 G82 · 2021–н.в.");
  });
  it("публичный URL фото", () => {
    assert.equal(publicImageUrl("https://abc.supabase.co/", "products/p/1.webp"),
      "https://abc.supabase.co/storage/v1/object/public/product-images/products/p/1.webp");
  });
  it("fastener_note", () => {
    assert.equal(buildFastenerNote(wheelRow(), G30, true), "Используйте штатные болты BMW M14×1.25 (конус 60°)");
    assert.equal(buildFastenerNote(wheelRow(), { make: "Audi", fastener_spec: "Болт M14×1.5", seat_type: "ball_r13" }, true),
      "Используйте штатные болты Audi M14×1.5 (сфера R13)");
    assert.equal(buildFastenerNote(wheelRow({ includes_fasteners: true }), G30, true), "Крепёж в комплекте");
    assert.equal(buildFastenerNote(wheelRow(), G30, false), null);
    assert.equal(buildFastenerNote(carbonRow(), G30, true), null);
  });
});
