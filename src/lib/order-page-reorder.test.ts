import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_CART, type Cart } from "@/lib/cart-store";
import {
  loadReorderLines, parseReorderProduct, planReorder, type ReorderLine, type ReorderProduct,
} from "@/lib/order-page-reorder";

const NOW = new Date("2026-10-03T09:00:00.000Z");
const P1 = "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51";
const P2 = "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68";
const wheel = (id = P1): ReorderProduct => ({ id, slug: "forged-m01", title: "M-01", type: "wheel_set", kind: "stock", price: 13370000 });
const carbon: ReorderProduct = { id: P2, slug: "diffuser", title: "Диффузор", type: "carbon_part", kind: "preorder", price: 9860000 };

describe("planReorder", () => {
  it("кладёт позиции в пустую корзину с актуальной ценой и slug", () => {
    const lines: ReorderLine[] = [{ quantity: 1, product: wheel() }];
    const plan = planReorder(EMPTY_CART, "stock", lines, NOW);
    assert.equal(plan.added, 1);
    assert.equal(plan.skipped, 0);
    assert.deepEqual(plan.cart.items[0], {
      product_id: P1, quantity: 1, price_seen: 13370000, title: "M-01", slug: "forged-m01", type: "wheel_set",
    });
    assert.equal(plan.cart.kind, "stock");
  });
  it("позиции без товара (нет slug / 404) пропускаются и считаются", () => {
    const plan = planReorder(EMPTY_CART, "stock", [{ quantity: 2, product: null }, { quantity: 1, product: wheel() }], NOW);
    assert.equal(plan.added, 1);
    assert.equal(plan.skipped, 1);
  });
  it("все позиции без товара → корзина не меняется, added = 0", () => {
    const plan = planReorder(EMPTY_CART, "stock", [{ quantity: 1, product: null }], NOW);
    assert.equal(plan.added, 0);
    assert.equal(plan.cart.items.length, 0);
  });
  it("количество не выше лимита позиции (BR-04)", () => {
    const plan = planReorder(EMPTY_CART, "stock", [{ quantity: 9, product: wheel() }], NOW);
    assert.equal(plan.cart.items[0].quantity, 2);
  });
  it("корзина того же kind дополняется, количество суммируется", () => {
    const current: Cart = {
      kind: "stock", updated_at: "", items: [{ product_id: P1, quantity: 1, price_seen: 1, type: "wheel_set" }],
    };
    const plan = planReorder(current, "stock", [{ quantity: 1, product: wheel() }], NOW);
    assert.equal(plan.cart.items.length, 1);
    assert.equal(plan.cart.items[0].quantity, 2);
  });
  it("корзина другого kind заменяется (BR-03)", () => {
    const current: Cart = {
      kind: "stock", updated_at: "", items: [{ product_id: P1, quantity: 1, price_seen: 1, type: "wheel_set" }],
    };
    const plan = planReorder(current, "preorder", [{ quantity: 1, product: carbon }], NOW);
    assert.deepEqual(plan.cart.items.map((i) => i.product_id), [P2]);
    assert.equal(plan.cart.kind, "preorder");
  });
});

describe("parseReorderProduct", () => {
  const detail = { id: P1, slug: "forged-m01", title: "M-01", type: "wheel_set", price: 100, price_atelier: null, availability: { mode: "stock" } };
  it("{ data: ProductDetail } → товар", () => {
    assert.deepEqual(parseReorderProduct({ data: detail }), { id: P1, slug: "forged-m01", title: "M-01", type: "wheel_set", kind: "stock", price: 100 });
  });
  it("цена ателье имеет приоритет", () => {
    assert.equal(parseReorderProduct({ data: { ...detail, price_atelier: 90 } })?.price, 90);
  });
  it("мусор → null", () => {
    assert.equal(parseReorderProduct(null), null);
    assert.equal(parseReorderProduct({ data: { ...detail, type: "x" } }), null);
    assert.equal(parseReorderProduct({ data: { ...detail, price: 1.5 } }), null);
  });
});

describe("loadReorderLines", () => {
  const items = [
    { title: "A", quantity: 1, unit_price_formatted: "", line_total_formatted: "", product_slug: "a" },
    { title: "B", quantity: 2, unit_price_formatted: "", line_total_formatted: "", product_slug: null },
    { title: "C", quantity: 1, unit_price_formatted: "", line_total_formatted: "", product_slug: "gone" },
  ];
  it("без slug запрос не уходит; 404 → null", async () => {
    const urls: string[] = [];
    const lines = await loadReorderLines(items, async (url) => {
      urls.push(url);
      return url.endsWith("/gone")
        ? new Response("{}", { status: 404 })
        : new Response(JSON.stringify({ data: { id: P1, slug: "a", title: "A", type: "wheel_set", price: 5, price_atelier: null, availability: { mode: "stock" } } }));
    });
    assert.deepEqual(urls.sort(), ["/api/products/a", "/api/products/gone"]);
    assert.equal(lines[0].product?.id, P1);
    assert.equal(lines[1].product, null);
    assert.equal(lines[2].product, null);
  });
  it("5xx → бросает (корзина не меняется)", async () => {
    await assert.rejects(loadReorderLines([items[0]], async () => new Response("{}", { status: 500 })));
  });
});
