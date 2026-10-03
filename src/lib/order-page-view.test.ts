import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixtureOrderViews } from "@/lib/order-page-fixtures";
import {
  cancelledText, deliveryPlace, expectedDateText, hasTimelineProgress, isPartiallyRefunded, markOrderExpired, partialRefundText,
  refundedText, stepStates, unpaidBannerText,
} from "@/lib/order-page-view";

const NOW = new Date("2026-10-03T09:00:00.000Z");
const views = fixtureOrderViews(NOW);
const v = (i: number) => views[`FC-26-${String(i).padStart(6, "0")}`];

describe("stepStates", () => {
  it("stock paid: Оплачен выполнен, «Проверен инженером» — текущий, остальные впереди", () => {
    assert.deepEqual(stepStates(v(1)), ["done", "current", "upcoming", "upcoming"]);
  });
  it("preorder in_transit: 6 шагов, 3 выполнено", () => {
    assert.equal(v(3).timeline.length, 6);
    assert.deepEqual(stepStates(v(3)), ["done", "done", "done", "current", "upcoming", "upcoming"]);
  });
  it("delivered: все выполнены, текущего нет", () => {
    assert.deepEqual(stepStates(v(9)), ["done", "done", "done", "done"]);
  });
  it("возвращённый заказ: текущего шага нет", () => {
    assert.ok(!stepStates(v(6)).includes("current"));
  });
  it("порядок шагов Блока 4", () => {
    assert.deepEqual(v(1).timeline.map((s) => s.label), ["Оплачен", "Проверен инженером", "Передан в доставку", "Доставлен"]);
    assert.deepEqual(v(3).timeline.map((s) => s.label), [
      "Оплачен", "Заказан у поставщика", "Едет в Москву", "Прибыл на склад", "Передан в доставку", "Доставлен",
    ]);
  });
});

describe("hasTimelineProgress", () => {
  it("не оплаченный и отменённый без выполненных шагов — таймлайн скрыт", () => {
    assert.equal(hasTimelineProgress(v(4)), false);
    assert.equal(hasTimelineProgress(v(5)), false);
    assert.equal(hasTimelineProgress(v(1)), true);
  });
});

describe("expectedDateText", () => {
  it("после отгрузки — диапазон доставки", () => assert.equal(expectedDateText(v(2), NOW), "Ожидаемая доставка: 4–7 октября"));
  it("preorder до прибытия — «Ожидаем на складе к 5 ноября»", () => {
    assert.equal(expectedDateText(v(3), NOW), "Ожидаем на складе к 5 ноября");
    assert.equal(expectedDateText(v(10), NOW), "Ожидаем на складе к 5 ноября");
  });
  it("preorder после прибытия без диапазона доставки — ничего", () => {
    assert.equal(expectedDateText({ ...v(3), status: "arrived" }, NOW), null);
  });
  it("delivered / отменён / возврат — ничего", () => {
    for (const i of [9, 5, 6]) assert.equal(expectedDateText(v(i), NOW), null);
  });
  it("stock paid без дат — ничего", () => assert.equal(expectedDateText(v(1), NOW), null));
});

describe("тексты состояний", () => {
  it("отмена и возврат дословно по Блоку 4", () => {
    assert.equal(cancelledText("Не оплачен за 30 минут"), "Заказ отменён: Не оплачен за 30 минут");
    assert.equal(cancelledText(null), "Заказ отменён");
    assert.equal(
      refundedText("133 700 ₽"),
      "Деньги возвращены: 133 700 ₽. Срок зачисления зависит от банка, обычно до 10 рабочих дней",
    );
    assert.equal(refundedText(null), "Деньги возвращены. Срок зачисления зависит от банка, обычно до 10 рабочих дней");
  });
  it("частичный возврат (Edge Case 38): текст и условие", () => {
    assert.equal(
      partialRefundText("33 400 ₽"),
      "Возвращено: 33 400 ₽. Срок зачисления зависит от банка, обычно до 10 рабочих дней",
    );
    const partial = { ...v(1), refunded_amount_formatted: "33 400 ₽" };
    assert.equal(isPartiallyRefunded(partial), true);
    assert.equal(isPartiallyRefunded(v(1)), false);
    assert.equal(isPartiallyRefunded(v(6)), false); // refunded — полный возврат
    assert.equal(isPartiallyRefunded({ ...partial, status: "cancelled" }), false);
  });
  it("блок оплаты: «не поступила» только после возврата с ЮKassa", () => {
    assert.equal(unpaidBannerText(true), "Оплата пока не поступила");
    assert.equal(unpaidBannerText(false), "Заказ ожидает оплаты");
  });
  it("markOrderExpired → cancelled с причиной, оплата недоступна", () => {
    const next = markOrderExpired(v(4));
    assert.equal(next.status, "cancelled");
    assert.equal(next.status_label, "Отменён");
    assert.equal(next.can_pay, false);
    assert.equal(next.reserved_until, null);
    assert.equal(next.cancel_reason, "Не оплачен за 30 минут");
  });
  it("адрес или ПВЗ", () => {
    assert.equal(deliveryPlace(v(1)), "Казань · ПВЗ СДЭК KZN45");
    assert.equal(deliveryPlace(v(7)), "Москва · ул. Тверская, 12, кв. 34");
  });
});
