import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFullyRefunded, refundTotals } from "@/lib/payments/refundable";

const P = (id: string, amount: number, status = "succeeded") => ({ id, amount, status });
const R = (payment_id: string, amount: number, status: string) => ({ payment_id, amount, status });

describe("refundTotals (BR-16)", () => {
  it("один платёж: refundable = paid − Σ refunds(pending|succeeded); failed / canceled не занимают сумму", () => {
    const t = refundTotals([P("a", 13370000), P("x", 13370000, "canceled")], [
      R("a", 3340000, "succeeded"), R("a", 1000000, "pending"), R("a", 5000000, "failed"), R("a", 5000000, "canceled"),
    ]);
    assert.deepEqual([t.paid_amount, t.refunded_amount, t.pending_refund_amount, t.refundable_amount], [13370000, 3340000, 1000000, 9030000]);
    assert.equal(isFullyRefunded(t), false);
  });

  it("полный возврат → 0 к возврату, isFullyRefunded", () => {
    const t = refundTotals([P("a", 13370000)], [R("a", 13370000, "succeeded")]);
    assert.deepEqual([t.refundable_amount, isFullyRefunded(t)], [0, true]);
    assert.equal(isFullyRefunded(refundTotals([], [])), false);
  });

  it("повторная оплата: к возврату — максимум остатка ОДНОГО платежа; вернувшийся дубль не делает заказ refunded", () => {
    const two = refundTotals([P("a", 13370000), P("b", 13370000)], []);
    assert.deepEqual([two.paid_amount, two.refundable_amount], [26740000, 13370000]);
    const dupBack = refundTotals([P("a", 13370000), P("b", 13370000)], [R("b", 13370000, "succeeded")]);
    assert.deepEqual([dupBack.refundable_amount, isFullyRefunded(dupBack)], [13370000, false]);
    // Строка дубля ещё pending в БД, но по нему уже есть возврат — его сумма всё равно входит в оплату.
    const lagging = refundTotals([P("a", 13370000), P("b", 13370000, "pending")], [R("b", 13370000, "succeeded")]);
    assert.deepEqual([lagging.paid_amount, isFullyRefunded(lagging)], [26740000, false]);
  });

  it("неоплаченный заказ → 0", () => {
    assert.equal(refundTotals([P("a", 13370000, "pending")], []).refundable_amount, 0);
  });
});
