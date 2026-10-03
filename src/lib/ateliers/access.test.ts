import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approvedAtelierId } from "@/lib/ateliers/access";
import { buildCartValidation } from "@/lib/cart/validate";
import { isAtelierPricing, tierPrice, toPublicProduct } from "@/lib/catalog";
import { wheelRow } from "@/lib/catalog/__fixtures__/rows";
import type { CartProduct } from "@/types/cart";

// BR-10 сквозняком: роль + статус заявки → atelierId → каталог (toPublicProduct), цена позиции (tierPrice),
// уровень корзины/заказа (buildCartValidation.price_tier). price_atelier — только одобренному ателье при FEATURE_ATELIER.

const AT = "e1c7a3b9-5d2f-4e8a-9b06-3f1d7c2e8a54";
const personas: Array<[string, string | null, { id: string; status: string } | null, string | null]> = [
  ["гость", null, null, null],
  ["покупатель", "customer", null, null],
  ["покупатель с заявкой на рассмотрении", "customer", { id: AT, status: "pending" }, null],
  ["роль atelier, заявка pending (частичный сбой)", "atelier", { id: AT, status: "pending" }, null],
  ["роль atelier, заявка rejected (отзыв)", "atelier", { id: AT, status: "rejected" }, null],
  ["роль customer, заявка approved (частичный сбой)", "customer", { id: AT, status: "approved" }, null],
  ["admin", "admin", { id: AT, status: "approved" }, null],
  ["одобренное ателье", "atelier", { id: AT, status: "approved" }, AT],
];

describe("BR-10: кто видит и платит price_atelier", () => {
  for (const [name, role, row, expected] of personas) {
    it(name, () => {
      const atelierId = approvedAtelierId(role, row);
      assert.equal(atelierId, expected);
      const ctx = { atelierId };
      const product = toPublicProduct(wheelRow({ price: 13370000, price_atelier: 11800000 }), ctx, true);
      assert.equal(product.price_atelier, expected ? 11800000 : null);
      assert.equal(tierPrice({ price: 13370000, price_atelier: 11800000 }, isAtelierPricing(ctx, true)), expected ? 11800000 : 13370000);
    });
  }

  it("FEATURE_ATELIER=false: даже одобренному ателье — розница", () => {
    const ctx = { atelierId: AT };
    assert.equal(toPublicProduct(wheelRow({ price_atelier: 11800000 }), ctx, false).price_atelier, null);
    assert.equal(isAtelierPricing(ctx, false), false);
  });

  it("US-010 п.6 / Edge Case 20: сессия истекла → корзина и заказ по рознице (price_tier retail)", () => {
    const product = (unit: number): CartProduct => ({
      id: "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", slug: "m-01-r20", title: "M-01 R20", type: "wheel_set",
      availability_mode: "stock", unit_price: unit, available_qty: 3, cover_image_url: null,
    });
    const items = [{ product_id: "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", quantity: 1 }];
    const asAtelier = buildCartValidation(items, [product(11800000)], "atelier");
    const expired = buildCartValidation(items, [product(13370000)], isAtelierPricing({ atelierId: approvedAtelierId(null, null) }, true) ? "atelier" : "retail");
    assert.equal(asAtelier.total, 11800000);
    assert.equal(expired.price_tier, "retail");
    assert.equal(expired.total, 13370000);
  });
});
