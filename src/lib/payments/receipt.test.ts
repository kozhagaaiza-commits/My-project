import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linesTotal, refundReceiptItems, toReceiptItems } from "@/lib/payments/receipt";

const LINES = [
  { title_snapshot: "Кованый моноблок M-01 R20", quantity: 1, unit_price: 13370000 },
  { title_snapshot: "Карбоновая губа BMW G30", quantity: 2, unit_price: 4500001 },
];
const sum = (items: Array<{ quantity: number; unit_price: number }>) => items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

describe("позиции чека", () => {
  it("toReceiptItems — снапшоты заказа как есть", () => {
    assert.deepEqual(toReceiptItems(LINES), [
      { title: "Кованый моноблок M-01 R20", quantity: 1, unit_price: 13370000 },
      { title: "Карбоновая губа BMW G30", quantity: 2, unit_price: 4500001 },
    ]);
    assert.equal(linesTotal(LINES), 22370002);
  });
  it("полный возврат — все позиции", () => {
    assert.deepEqual(refundReceiptItems(LINES, 22370002), toReceiptItems(LINES));
  });
  it("частичный — пропорционально, сумма чека ровно равна сумме возврата", () => {
    for (const amount of [1, 2, 3, 3340000, 11185001, 22370001]) {
      const items = refundReceiptItems(LINES, amount);
      assert.equal(sum(items), amount, String(amount));
      assert.ok(items.every((i) => i.quantity === 1 && i.unit_price > 0));
    }
  });
  it("большие суммы без потери точности", () => {
    const big = [{ title_snapshot: "A", quantity: 4, unit_price: 2_500_000_000 }, { title_snapshot: "B", quantity: 1, unit_price: 999_999_999 }];
    assert.equal(sum(refundReceiptItems(big, 7_777_777_777)), 7_777_777_777);
  });
  it("сумма вне (0, total] — ошибка", () => {
    assert.throws(() => refundReceiptItems(LINES, 0), RangeError);
    assert.throws(() => refundReceiptItems(LINES, 22370003), RangeError);
    assert.throws(() => refundReceiptItems(LINES, 1.5), RangeError);
  });
});
