import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { cartValidateBody, cartValidationMessage } from "@/lib/schemas/cart";

const A = "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51";
const ids = Array.from({ length: 11 }, (_, i) => `8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e${String(i).padStart(2, "0")}`);

const fail = (input: unknown): z.ZodError<z.infer<typeof cartValidateBody>> => {
  const r = cartValidateBody.safeParse(input);
  assert.equal(r.success, false);
  assert.ok(r.error);
  return r.error;
};

describe("cartValidateBody (Блок 3)", () => {
  it("корректный запрос проходит", () => {
    const r = cartValidateBody.safeParse({ items: [{ product_id: A, quantity: 1 }] });
    assert.ok(r.success);
  });
  it("пустой массив → «Корзина пуста», fieldErrors как в примере Блока 3", () => {
    const err = fail({ items: [] });
    assert.equal(cartValidationMessage(err), "Корзина пуста");
    assert.deepEqual(z.flattenError(err).fieldErrors, { items: ["Too small: expected array to have >=1 items"] });
  });
  it("дубли product_id → «Один товар — одна позиция»", () => {
    const err = fail({ items: [{ product_id: A, quantity: 1 }, { product_id: A, quantity: 1 }] });
    assert.deepEqual(z.flattenError(err).fieldErrors.items, ["Один товар — одна позиция"]);
    assert.equal(cartValidationMessage(err), "Проверьте корзину");
  });
  it("лимиты: quantity 1..4 целое, не больше 10 позиций", () => {
    fail({ items: [{ product_id: A, quantity: 0 }] });
    fail({ items: [{ product_id: A, quantity: 5 }] });
    fail({ items: [{ product_id: A, quantity: 1.5 }] });
    fail({ items: [{ product_id: A, quantity: "1" }] });
    const err = fail({ items: ids.map((id) => ({ product_id: id, quantity: 1 })) });
    assert.equal(cartValidationMessage(err), "Проверьте корзину");
    assert.ok(cartValidateBody.safeParse({ items: ids.slice(0, 10).map((id) => ({ product_id: id, quantity: 4 })) }).success);
  });
  it("product_id не UUID, нет items, тело null / не объект → «Проверьте корзину»", () => {
    for (const input of [{ items: [{ product_id: "abc", quantity: 1 }] }, {}, null, "x"]) {
      assert.equal(cartValidationMessage(fail(input)), "Проверьте корзину");
    }
  });
  it("лишние поля (price_seen) отбрасываются", () => {
    const r = cartValidateBody.safeParse({ items: [{ product_id: A, quantity: 1, price_seen: 100 }], kind: "stock" });
    assert.ok(r.success);
    assert.deepEqual(r.data, { items: [{ product_id: A, quantity: 1 }] });
  });
});
