import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ORDER_STATUSES_ALL } from "@/lib/schemas/admin-orders";
import { TRANSITIONS, allowedTransitions, canTransition, invalidTransitionMessage } from "@/lib/order-status";

// Таблица переходов 5.3 и её свойства (BR-12, BR-19).

describe("order-status: таблица 5.3", () => {
  it("stock: pending_payment → cancelled; paid → confirmed → shipped → delivered", () => {
    assert.deepEqual(allowedTransitions("stock", "pending_payment"), ["cancelled"]);
    assert.deepEqual(allowedTransitions("stock", "paid"), ["confirmed"]);
    assert.deepEqual(allowedTransitions("stock", "confirmed"), ["shipped"]);
    assert.deepEqual(allowedTransitions("stock", "shipped"), ["delivered"]);
    for (const s of ["delivered", "cancelled", "refunded"]) assert.deepEqual(allowedTransitions("stock", s), []);
  });

  it("preorder: paid → ordered_from_supplier → in_transit → arrived → shipped → delivered", () => {
    assert.deepEqual(allowedTransitions("preorder", "pending_payment"), ["cancelled"]);
    assert.deepEqual(allowedTransitions("preorder", "paid"), ["ordered_from_supplier"]);
    assert.deepEqual(allowedTransitions("preorder", "ordered_from_supplier"), ["in_transit"]);
    assert.deepEqual(allowedTransitions("preorder", "in_transit"), ["arrived"]);
    assert.deepEqual(allowedTransitions("preorder", "arrived"), ["shipped"]);
    assert.deepEqual(allowedTransitions("preorder", "shipped"), ["delivered"]);
    for (const s of ["delivered", "cancelled", "refunded"]) assert.deepEqual(allowedTransitions("preorder", s), []);
  });

  it("статусы чужого типа и неизвестные → []", () => {
    assert.deepEqual(allowedTransitions("stock", "ordered_from_supplier"), []);
    assert.deepEqual(allowedTransitions("preorder", "confirmed"), []);
    assert.deepEqual(allowedTransitions("stock", "nope"), []);
    assert.deepEqual(allowedTransitions("stock", "__proto__"), []);
    assert.deepEqual(allowedTransitions("stock", "toString"), []);
    assert.equal(canTransition("stock", "constructor", "cancelled"), false);
  });

  it("paid, refunded, pending_payment не достижимы ни из одного статуса (только webhook / возврат / создание)", () => {
    for (const kind of ["stock", "preorder"] as const) {
      for (const from of ORDER_STATUSES_ALL) {
        const to = allowedTransitions(kind, from);
        for (const banned of ["paid", "refunded", "pending_payment"]) assert.ok(!to.includes(banned as never), `${kind}:${from}→${banned}`);
      }
    }
  });

  it("BR-19: cancelled только из pending_payment", () => {
    for (const kind of ["stock", "preorder"] as const) {
      for (const from of ORDER_STATUSES_ALL) {
        assert.equal(canTransition(kind, from, "cancelled"), from === "pending_payment", `${kind}:${from}`);
      }
    }
  });

  it("allowedTransitions возвращает копию: таблицу не испортить снаружи", () => {
    const a = allowedTransitions("stock", "paid");
    a.push("delivered");
    assert.deepEqual(TRANSITIONS.stock.paid, ["confirmed"]);
    assert.deepEqual(allowedTransitions("stock", "paid"), ["confirmed"]);
  });

  it("текст 409 дословно из Блока 3", () => {
    assert.equal(invalidTransitionMessage("paid", "delivered"), "Из статуса «Оплачен» нельзя перейти в «Доставлен»");
  });
});
