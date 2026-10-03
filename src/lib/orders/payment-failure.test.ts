import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BANK_DECLINE_REASONS, PAYMENT_BANK_DECLINED_TEXT, PAYMENT_FAILED_TEXT, paymentFailureText,
} from "@/lib/orders/payment-failure";

// Edge Cases 35/37: код причины отмены ЮKassa → один из двух текстов Чертежа (код наружу не выходит).

describe("paymentFailureText", () => {
  it("тексты дословно по Блоку 6", () => {
    assert.equal(PAYMENT_BANK_DECLINED_TEXT, "Банк отклонил платёж. Попробуйте СБП или другую карту");
    assert.equal(PAYMENT_FAILED_TEXT, "Оплата не прошла");
  });

  it("лимит банка / отказ эмитента → «Банк отклонил платёж…» (Edge Case 35)", () => {
    for (const reason of ["payment_method_limit_exceeded", "call_issuer", "general_decline", "payment_method_restricted"]) {
      assert.equal(paymentFailureText({ status: "canceled", cancellation_reason: reason }), PAYMENT_BANK_DECLINED_TEXT, reason);
    }
    assert.ok(BANK_DECLINE_REASONS.has("payment_method_limit_exceeded"));
  });

  it("покупатель отменил / недостаточно средств / неизвестный код / null → «Оплата не прошла» (Edge Case 37)", () => {
    for (const reason of ["expired_on_confirmation", "insufficient_funds", "3d_secure_failed", "something_new", null]) {
      assert.equal(paymentFailureText({ status: "canceled", cancellation_reason: reason }), PAYMENT_FAILED_TEXT, String(reason));
    }
  });

  it("последний платёж не отменён или платежей нет → null", () => {
    assert.equal(paymentFailureText(null), null);
    for (const status of ["pending", "waiting_for_capture", "succeeded"] as const) {
      assert.equal(paymentFailureText({ status, cancellation_reason: "call_issuer" }), null, status);
    }
  });
});
