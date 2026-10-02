import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_CART, acknowledgePrices, addItem, cartCount, emptyCart, maxQuantityMessage, parseStoredCart, plural,
  qtyReducedMessage, reconcileCart, removeItem, replaceWith, restoreItem, serializeCart, setQuantity, validationKey,
  type Cart, type CartItem,
} from "@/lib/cart-store";
import type { CartValidateItem, CartValidation } from "@/types/cart";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const wheel = (n: number, quantity = 1): CartItem => ({ product_id: id(n), quantity, price_seen: 13370000, type: "wheel_set", title: `Диск ${n}`, slug: `disc-${n}` });
const carbon = (n: number, quantity = 1): CartItem => ({ product_id: id(100 + n), quantity, price_seen: 9860000, type: "carbon_part", title: `Деталь ${n}`, slug: `part-${n}` });

const withItems = (kind: Cart["kind"], items: CartItem[]): Cart => ({ kind, items, updated_at: NOW.toISOString() });

describe("parseStoredCart (Edge Case 17)", () => {
  it("нет записи → пустая корзина без перезаписи", () => {
    const r = parseStoredCart(null);
    assert.equal(r.cart, EMPTY_CART);
    assert.equal(r.dirty, false);
  });
  it("битый JSON и не-объекты → пустая корзина + перезапись", () => {
    for (const raw of ["{not json", "", "null", "42", '"x"', "[]", '{"kind":"stock"}', '{"items":"x"}']) {
      const r = parseStoredCart(raw);
      assert.equal(r.cart.items.length, 0, raw);
      assert.equal(r.dirty, true, raw);
    }
  });
  it("корректный StoredCart читается как есть", () => {
    const raw = JSON.stringify({ kind: "preorder", items: [{ product_id: id(101), quantity: 2, price_seen: 9860000 }], updated_at: NOW.toISOString() });
    const r = parseStoredCart(raw);
    assert.equal(r.dirty, false);
    assert.equal(r.cart.kind, "preorder");
    assert.deepEqual(r.cart.items, [{ product_id: id(101), quantity: 2, price_seen: 9860000 }]);
  });
  it("мусорные позиции отбрасываются, остальные остаются", () => {
    const raw = JSON.stringify({
      kind: "stock",
      items: [
        { product_id: id(1), quantity: 1, price_seen: 100 },
        { product_id: id(2), quantity: 0, price_seen: 100 },
        { product_id: id(3), quantity: 1.5, price_seen: 100 },
        { product_id: id(4), quantity: "2", price_seen: 100 },
        { product_id: id(5), quantity: 1, price_seen: -1 },
        { product_id: id(6), quantity: 1, price_seen: 1.5 },
        { product_id: 7, quantity: 1, price_seen: 100 },
        { product_id: "", quantity: 1, price_seen: 100 },
        null, "x", 5,
        { product_id: id(1), quantity: 2, price_seen: 100 }, // дубль
      ],
      updated_at: "2026-10-01T00:00:00.000Z",
    });
    const r = parseStoredCart(raw);
    assert.deepEqual(r.cart.items.map((i) => i.product_id), [id(1)]);
    assert.equal(r.cart.items[0].quantity, 1);
    assert.equal(r.dirty, true);
  });
  it("количество обрезается лимитом, лишние позиции (>10) отбрасываются, неверный slug игнорируется", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ product_id: id(i + 1), quantity: 9, price_seen: 100, type: i === 0 ? "wheel_set" : "carbon_part", slug: "BAD SLUG" }));
    const r = parseStoredCart(JSON.stringify({ kind: "stock", items, updated_at: "" }));
    assert.equal(r.cart.items.length, 10);
    assert.equal(r.cart.items[0].quantity, 2);
    assert.equal(r.cart.items[1].quantity, 4);
    assert.equal(r.cart.items[0].slug, undefined);
    assert.equal(r.dirty, true);
  });
  it("неизвестный kind → stock + перезапись", () => {
    const r = parseStoredCart(JSON.stringify({ kind: "weird", items: [{ product_id: id(1), quantity: 1, price_seen: 1 }], updated_at: "" }));
    assert.equal(r.cart.kind, "stock");
    assert.equal(r.dirty, true);
  });
  it("serialize → parse возвращает ту же корзину", () => {
    const cart = withItems("stock", [wheel(1, 2), wheel(2)]);
    const r = parseStoredCart(serializeCart(cart));
    assert.equal(r.dirty, false);
    assert.deepEqual(r.cart, cart);
  });
});

describe("addItem: kind, слияние, лимиты (BR-03, BR-04)", () => {
  it("пустая корзина: kind задаёт первый товар", () => {
    const r = addItem(emptyCart(NOW), { item: carbon(1), kind: "preorder" }, NOW);
    assert.equal(r.status, "added");
    assert.equal(r.cart.kind, "preorder");
    assert.equal(cartCount(r.cart), 1);
  });
  it("повторное добавление суммирует количество", () => {
    const first = addItem(emptyCart(NOW), { item: wheel(1), kind: "stock" }, NOW).cart;
    const r = addItem(first, { item: wheel(1), kind: "stock" }, NOW);
    assert.equal(r.status, "added");
    assert.equal(r.quantity, 2);
    assert.equal(r.cart.items.length, 1);
  });
  it("диск: не больше 2 комплектов; на максимуме — limited + unchanged", () => {
    const r1 = addItem(withItems("stock", [wheel(1, 2)]), { item: wheel(1), kind: "stock" }, NOW);
    assert.equal(r1.status, "limited");
    assert.equal(r1.unchanged, true);
    assert.equal(r1.quantity, 2);
    const r2 = addItem(withItems("stock", [wheel(1, 1)]), { item: wheel(1, 2), kind: "stock" }, NOW);
    assert.equal(r2.status, "limited");
    assert.equal(r2.unchanged, false);
    assert.equal(r2.quantity, 2);
  });
  it("карбон: не больше 4 штук", () => {
    const r = addItem(withItems("preorder", [carbon(1, 3)]), { item: carbon(1, 3), kind: "preorder" }, NOW);
    assert.equal(r.status, "limited");
    assert.equal(r.quantity, 4);
    assert.equal(r.max, 4);
  });
  it("другой kind → mixed_kind, корзина не меняется", () => {
    const cart = withItems("stock", [wheel(1)]);
    const r = addItem(cart, { item: carbon(1), kind: "preorder" }, NOW);
    assert.equal(r.status, "mixed_kind");
    assert.equal(r.cart, cart);
  });
  it("не больше 10 позиций; увеличение существующей при полной корзине разрешено", () => {
    const items = Array.from({ length: 10 }, (_, i) => carbon(i + 1));
    const full = withItems("preorder", items);
    assert.equal(addItem(full, { item: carbon(11), kind: "preorder" }, NOW).status, "too_many_lines");
    assert.equal(addItem(full, { item: carbon(3), kind: "preorder" }, NOW).status, "added");
  });
  it("replaceWith: новая корзина с новым kind", () => {
    const cart = replaceWith("preorder", [carbon(1)], NOW);
    assert.equal(cart.kind, "preorder");
    assert.equal(cart.items.length, 1);
  });
});

describe("setQuantity / removeItem / restoreItem", () => {
  it("setQuantity ограничивает 1…лимит и не трогает неизвестный id", () => {
    const cart = withItems("stock", [wheel(1), wheel(2)]);
    assert.equal(setQuantity(cart, id(1), 5, NOW).items[0].quantity, 2);
    assert.equal(setQuantity(cart, id(1), 0, NOW).items[0].quantity, 1);
    assert.equal(setQuantity(cart, id(9), 2, NOW), cart);
    assert.equal(setQuantity(cart, id(1), 1, NOW), cart);
    assert.equal(setQuantity(cart, id(1), Number.NaN, NOW), cart);
  });
  it("remove + undo возвращает позицию на прежнее место", () => {
    const cart = withItems("stock", [wheel(1), wheel(2), wheel(3)]);
    const { cart: after, removed } = removeItem(cart, id(2), NOW);
    assert.deepEqual(after.items.map((i) => i.product_id), [id(1), id(3)]);
    assert.ok(removed);
    const back = restoreItem(after, removed, NOW);
    assert.deepEqual(back.items.map((i) => i.product_id), [id(1), id(2), id(3)]);
  });
  it("undo последней позиции восстанавливает kind пустой корзины", () => {
    const cart = withItems("preorder", [carbon(1)]);
    const { cart: after, removed } = removeItem(cart, id(101), NOW);
    assert.equal(after.items.length, 0);
    assert.ok(removed);
    const back = restoreItem(after, removed, NOW);
    assert.equal(back.kind, "preorder");
    assert.equal(back.items.length, 1);
  });
  it("undo не работает, если за 5 секунд добавили товар другого kind, и не дублирует позицию", () => {
    const { cart: after, removed } = removeItem(withItems("stock", [wheel(1)]), id(1), NOW);
    assert.ok(removed);
    const other = addItem(after, { item: carbon(1), kind: "preorder" }, NOW).cart;
    assert.equal(restoreItem(other, removed, NOW), other);
    const again = addItem(after, { item: wheel(1), kind: "stock" }, NOW).cart;
    assert.equal(restoreItem(again, removed, NOW), again);
  });
  it("removeItem для неизвестного id — без изменений", () => {
    const cart = withItems("stock", [wheel(1)]);
    const r = removeItem(cart, id(9), NOW);
    assert.equal(r.cart, cart);
    assert.equal(r.removed, null);
  });
});

function line(over: Partial<CartValidateItem> & { product_id: string }): CartValidateItem {
  return {
    slug: "disc-1", title: "Диск 1", cover_image_url: null, quantity: 1, max_quantity: 2, unit_price: 13370000,
    unit_price_formatted: "133 700 ₽", line_total: 13370000, line_total_formatted: "133 700 ₽",
    available: true, available_qty: 3, problem: null, ...over,
  };
}
const validation = (items: CartValidateItem[]): CartValidation => ({
  kind: "stock", items, subtotal: 0, subtotal_formatted: "", delivery_price: 0, total: 0, total_formatted: "",
  can_checkout: true, price_tier: "retail",
});

describe("reconcileCart / acknowledgePrices", () => {
  it("qty_reduced уменьшает количество и сообщает о позиции", () => {
    const cart = withItems("stock", [wheel(1, 2)]);
    const r = reconcileCart(cart, validation([line({ product_id: id(1), quantity: 1, available_qty: 1, problem: "qty_reduced" })]), NOW);
    assert.equal(r.changed, true);
    assert.equal(r.cart.items[0].quantity, 1);
    assert.deepEqual(r.reduced, [{ product_id: id(1), quantity: 1, type: "wheel_set" }]);
  });
  it("корзина, совпадающая с ответом, не меняется (та же ссылка)", () => {
    const cart = withItems("stock", [wheel(1, 1)]);
    const r = reconcileCart(cart, validation([line({ product_id: id(1), slug: "disc-1", title: "Диск 1" })]), NOW);
    assert.equal(r.changed, false);
    assert.equal(r.cart, cart);
  });
  it("unavailable: количество не трогаем, пустые title/slug не затирают локальные", () => {
    const cart = withItems("stock", [wheel(1, 2)]);
    const r = reconcileCart(cart, validation([line({ product_id: id(1), quantity: 2, title: "", slug: "", available: false, problem: "unavailable" })]), NOW);
    assert.equal(r.changed, false);
    assert.equal(r.cart.items[0].title, "Диск 1");
  });
  it("количество не выше max_quantity из ответа", () => {
    const cart = withItems("preorder", [{ ...carbon(1, 4), type: undefined }]);
    const r = reconcileCart(cart, validation([line({ product_id: id(101), quantity: 4, max_quantity: 2, slug: "part-1", title: "Деталь 1" })]), NOW);
    assert.equal(r.cart.items[0].quantity, 2);
  });
  it("price_seen не меняется при сверке; acknowledgePrices обновляет по ответу", () => {
    const cart = withItems("stock", [wheel(1)]);
    const v = validation([line({ product_id: id(1), unit_price: 13520000 })]);
    assert.equal(reconcileCart(cart, v, NOW).cart.items[0].price_seen, 13370000);
    assert.equal(acknowledgePrices(cart, v, NOW).items[0].price_seen, 13520000);
    assert.equal(acknowledgePrices(cart, validation([line({ product_id: id(1) })]), NOW), cart);
  });
});

describe("тексты и ключи", () => {
  it("validationKey зависит только от id и количества", () => {
    const a = withItems("stock", [wheel(1, 1)]);
    const b = { ...a, items: [{ ...a.items[0], price_seen: 1, title: "x" }] };
    assert.equal(validationKey(a), validationKey(b));
    assert.notEqual(validationKey(a), validationKey(withItems("stock", [wheel(1, 2)])));
  });
  it("склонения и сообщения", () => {
    assert.deepEqual([1, 2, 5, 11, 12, 21, 22, 25].map((n) => plural(n, ["комплект", "комплекта", "комплектов"])),
      ["комплект", "комплекта", "комплектов", "комплектов", "комплектов", "комплект", "комплекта", "комплектов"]);
    assert.equal(qtyReducedMessage(1, "wheel_set"), "Доступно только 1 комплект, количество уменьшено");
    assert.equal(qtyReducedMessage(2, "wheel_set"), "Доступно только 2 комплекта, количество уменьшено");
    assert.equal(maxQuantityMessage(2, "wheel_set"), "Максимум 2 комплекта одного диска в заказе");
    assert.equal(maxQuantityMessage(4, "carbon_part"), "Максимум 4 штуки одной детали в заказе");
  });
});
