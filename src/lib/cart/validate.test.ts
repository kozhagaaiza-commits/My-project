import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCartValidation, qtyLimitFor } from "@/lib/cart/validate";
import { formatRub } from "@/lib/money";
import type { CartProduct } from "@/types/cart";

const W = "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51";
const W2 = "0d4b6e8a-1c3f-4a5b-9e7d-2f6a8c0b4e13";
const C = "a3e9c1b7-2d4f-4e8a-b6c0-1f7d9e3a5b28";
const C2 = "5e7a9c1b-3d5f-4b7a-8c9e-0a2b4d6f8e17";
const GONE = "9f8e7d6c-5b4a-4c3d-9e2f-1a0b9c8d7e6f";

const wheel = (over: Partial<CartProduct> = {}): CartProduct => ({
  id: W, slug: "forged-m01-r20-5x112-graphite", title: "Кованый моноблок M-01 R20, 5×112, графит", type: "wheel_set",
  availability_mode: "stock", unit_price: 13370000, available_qty: 3,
  cover_image_url: "https://abcdefghijklmnop.supabase.co/storage/v1/object/public/product-images/products/x/1.webp",
  ...over,
});
const carbon = (over: Partial<CartProduct> = {}): CartProduct => ({
  id: C, slug: "bmw-m4-g82-carbon-rear-diffuser", title: "Задний диффузор, карбон, BMW M4 G82/G83", type: "carbon_part",
  availability_mode: "preorder", unit_price: 9860000, available_qty: null, cover_image_url: null,
  ...over,
});

describe("buildCartValidation: ответ 200 Блока 3", () => {
  it("пример из Чертежа: 1 комплект в наличии", () => {
    const v = buildCartValidation([{ product_id: W, quantity: 1 }], [wheel()], "retail");
    assert.deepEqual(v, {
      kind: "stock",
      items: [{
        product_id: W, slug: "forged-m01-r20-5x112-graphite", title: "Кованый моноблок M-01 R20, 5×112, графит",
        cover_image_url: wheel().cover_image_url, quantity: 1, max_quantity: 2,
        unit_price: 13370000, unit_price_formatted: formatRub(13370000),
        line_total: 13370000, line_total_formatted: formatRub(13370000),
        available: true, available_qty: 3, problem: null,
      }],
      subtotal: 13370000, subtotal_formatted: formatRub(13370000),
      delivery_price: 0, total: 13370000, total_formatted: formatRub(13370000),
      can_checkout: true, price_tier: "retail",
    });
  });
  it("форматирование: «133 700 ₽» (неразрывные пробелы Intl ru-RU)", () => {
    const v = buildCartValidation([{ product_id: W, quantity: 1 }], [wheel()], "retail");
    assert.equal(v.total_formatted.replace(/\s/g, " "), "133 700 ₽");
  });
  it("price_tier пробрасывается как есть", () => {
    assert.equal(buildCartValidation([{ product_id: W, quantity: 1 }], [wheel()], "atelier").price_tier, "atelier");
  });
  it("суммы — целые копейки: subtotal = Σ unit_price × quantity, total = subtotal (доставка 0, BR-11)", () => {
    const v = buildCartValidation(
      [{ product_id: C, quantity: 3 }, { product_id: C2, quantity: 2 }],
      [carbon(), carbon({ id: C2, unit_price: 1234567 })], "retail");
    assert.equal(v.subtotal, 9860000 * 3 + 1234567 * 2);
    assert.equal(v.total, v.subtotal);
    assert.equal(v.delivery_price, 0);
    assert.ok(Number.isInteger(v.subtotal));
    assert.equal(v.items[1].line_total_formatted, formatRub(2469134));
  });
});

describe("пустая корзина и kind", () => {
  it("пустой набор → can_checkout=false, kind stock, суммы 0", () => {
    const v = buildCartValidation([], [], "retail");
    assert.equal(v.can_checkout, false);
    assert.equal(v.kind, "stock");
    assert.equal(v.subtotal, 0);
    assert.deepEqual(v.items, []);
  });
  it("kind — по первому НАЙДЕННОМУ товару в порядке запроса", () => {
    const v = buildCartValidation([{ product_id: GONE, quantity: 1 }, { product_id: C, quantity: 1 }], [carbon()], "retail");
    assert.equal(v.kind, "preorder");
    assert.equal(v.items[1].problem, null);
  });
  it("ни один товар не найден → kind stock", () => {
    assert.equal(buildCartValidation([{ product_id: GONE, quantity: 1 }], [], "retail").kind, "stock");
  });
});

describe("problem", () => {
  it("unavailable (Edge Case 13): нули, пустые title/slug, can_checkout=false, порядок позиций сохранён", () => {
    const v = buildCartValidation([{ product_id: W, quantity: 1 }, { product_id: GONE, quantity: 2 }], [wheel()], "retail");
    assert.deepEqual(v.items[1], {
      product_id: GONE, slug: "", title: "", cover_image_url: null, quantity: 2, max_quantity: 0,
      unit_price: 0, unit_price_formatted: formatRub(0), line_total: 0, line_total_formatted: formatRub(0),
      available: false, available_qty: 0, problem: "unavailable",
    });
    assert.equal(v.can_checkout, false);
    assert.equal(v.subtotal, 13370000);
  });
  it("out_of_stock: available_qty=0 → available=false, количество не меняется, в итог не входит", () => {
    const v = buildCartValidation([{ product_id: W, quantity: 1 }], [wheel({ available_qty: 0 })], "retail");
    const [i] = v.items;
    assert.equal(i.problem, "out_of_stock");
    assert.equal(i.available, false);
    assert.equal(i.available_qty, 0);
    assert.equal(i.max_quantity, 0);
    assert.equal(i.quantity, 1);
    assert.equal(v.subtotal, 0);
    assert.equal(v.can_checkout, false);
  });
  it("qty_reduced по остатку: quantity → available_qty, can_checkout остаётся true", () => {
    const v = buildCartValidation([{ product_id: W, quantity: 2 }], [wheel({ available_qty: 1 })], "retail");
    const [i] = v.items;
    assert.equal(i.problem, "qty_reduced");
    assert.equal(i.quantity, 1);
    assert.equal(i.max_quantity, 1);
    assert.equal(i.line_total, 13370000);
    assert.equal(v.subtotal, 13370000);
    assert.equal(v.can_checkout, true);
  });
  it("qty_reduced по лимиту типа (BR-04): 4 комплекта при остатке 10 → 2", () => {
    const v = buildCartValidation([{ product_id: W, quantity: 4 }], [wheel({ available_qty: 10 })], "retail");
    assert.equal(v.items[0].quantity, 2);
    assert.equal(v.items[0].max_quantity, 2);
    assert.equal(v.items[0].problem, "qty_reduced");
    assert.equal(v.total, 2 * 13370000);
  });
  it("в пределах лимита и остатка — без проблемы", () => {
    const v = buildCartValidation([{ product_id: W, quantity: 2 }], [wheel({ available_qty: 2 })], "retail");
    assert.equal(v.items[0].problem, null);
    assert.equal(v.items[0].max_quantity, 2);
  });
  it("preorder: остаток не проверяется, available_qty null, max_quantity = лимит типа", () => {
    const v = buildCartValidation([{ product_id: C, quantity: 4 }], [carbon()], "retail");
    assert.equal(v.items[0].available_qty, null);
    assert.equal(v.items[0].available, true);
    assert.equal(v.items[0].max_quantity, 4);
    assert.equal(v.items[0].problem, null);
    assert.equal(v.kind, "preorder");
  });
  it("preorder-диск: лимит 2 комплекта сохраняется", () => {
    const v = buildCartValidation([{ product_id: W, quantity: 3 }], [wheel({ availability_mode: "preorder", available_qty: null })], "retail");
    assert.equal(v.items[0].quantity, 2);
    assert.equal(v.items[0].problem, "qty_reduced");
  });
  it("mixed_kind (BR-03): позиция другого типа исключена из итога, can_checkout=false", () => {
    const v = buildCartValidation(
      [{ product_id: W, quantity: 1 }, { product_id: C, quantity: 1 }], [carbon(), wheel()], "retail");
    assert.equal(v.kind, "stock");
    assert.equal(v.items[0].problem, null);
    assert.equal(v.items[1].problem, "mixed_kind");
    assert.equal(v.items[1].line_total, 9860000);
    assert.equal(v.subtotal, 13370000);
    assert.equal(v.can_checkout, false);
  });
  it("mixed_kind важнее out_of_stock и qty_reduced", () => {
    const v = buildCartValidation(
      [{ product_id: C, quantity: 1 }, { product_id: W, quantity: 1 }, { product_id: W2, quantity: 4 }],
      [carbon(), wheel({ available_qty: 0 }), wheel({ id: W2, available_qty: 5 })], "retail");
    assert.deepEqual(v.items.map((i) => i.problem), [null, "mixed_kind", "mixed_kind"]);
    assert.equal(v.items[2].quantity, 2); // количество всё равно не больше допустимого
    assert.equal(v.subtotal, 9860000);
  });
  it("исключённые позиции не входят в итог: только покупаемые", () => {
    const v = buildCartValidation(
      [{ product_id: W, quantity: 1 }, { product_id: W2, quantity: 1 }, { product_id: GONE, quantity: 1 }],
      [wheel(), wheel({ id: W2, available_qty: 0, unit_price: 5000000 })], "retail");
    assert.equal(v.subtotal, 13370000);
    assert.equal(v.total, 13370000);
    assert.equal(v.can_checkout, false);
  });
  it("отрицательный available_qty (не должен приходить) трактуется как 0", () => {
    const v = buildCartValidation([{ product_id: W, quantity: 1 }], [wheel({ available_qty: -2 })], "retail");
    assert.equal(v.items[0].available_qty, 0);
    assert.equal(v.items[0].problem, "out_of_stock");
  });
});

describe("qtyLimitFor (BR-04)", () => {
  it("2 комплекта дисков, 4 карбоновые детали", () => {
    assert.equal(qtyLimitFor("wheel_set"), 2);
    assert.equal(qtyLimitFor("carbon_part"), 4);
  });
});
