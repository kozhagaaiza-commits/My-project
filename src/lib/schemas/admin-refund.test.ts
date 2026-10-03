import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { RESERVED_REFUND_REASON, RESERVED_REFUND_REASON_MESSAGE, refundBody } from "@/lib/schemas/admin-refund";

const ok = { amount: 13370000, reason: "Клиент отказался до отправки", restock: true };
const fields = (v: unknown) => {
  const r = refundBody.safeParse(v);
  return r.success ? null : z.flattenError(r.error).fieldErrors;
};

describe("refundBody (Блок 3)", () => {
  it("пример Блока 3 проходит, reason обрезается", () => {
    assert.deepEqual(refundBody.parse(ok), ok);
    assert.equal(refundBody.parse({ ...ok, reason: "  Брак диска  " }).reason, "Брак диска");
  });

  it("amount — целые копейки > 0 и ≤ integer Postgres", () => {
    for (const amount of [0, -1, 1.5, "13370000", 2_147_483_648, null]) assert.ok(fields({ ...ok, amount })?.amount, String(amount));
    assert.equal(refundBody.parse({ ...ok, amount: 1 }).amount, 1);
  });

  it("reason 5–500 символов (по символам Unicode, как char_length)", () => {
    assert.deepEqual(fields({ ...ok, reason: "abcd" })?.reason?.[0], "Минимум 5 символов");
    assert.ok(fields({ ...ok, reason: "x".repeat(501) })?.reason);
    assert.equal(fields({ ...ok, reason: "x".repeat(500) }), null);
    assert.ok(fields({ ...ok, reason: "😀😀😀" })?.reason, "3 символа = 6 единиц UTF-16");
    assert.equal(fields({ ...ok, reason: "😀😀😀😀😀" }), null);
  });

  it("«Повторная оплата» зарезервирована (uq_refunds_duplicate_payment) — с любым регистром и пробелами", () => {
    assert.equal(RESERVED_REFUND_REASON, "Повторная оплата");
    for (const reason of ["Повторная оплата", "  повторная ОПЛАТА "]) {
      assert.deepEqual(fields({ ...ok, reason })?.reason, [RESERVED_REFUND_REASON_MESSAGE], reason);
    }
    assert.equal(fields({ ...ok, reason: "Повторная оплата — клиент просит вернуть первую" }), null);
  });

  it("restock обязателен и boolean", () => {
    assert.ok(fields({ amount: 1, reason: "Клиент передумал" })?.restock);
    assert.ok(fields({ ...ok, restock: "true" })?.restock);
  });
});
