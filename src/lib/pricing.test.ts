import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRub } from "@/lib/money";
import { computeAutoPrice, computeAutoPriceDetails, formatPriceCalculation, minorUnitsToString, toScaledInt } from "@/lib/pricing";

// Блок 5.4 / US-006: цена = ceil(закупка × курс × множитель / шаг) × шаг, копейки — целые.

/** Формула Чертежа во float — эталон там, где float не ошибается. */
const blueprintFloat = (c: number, r: number, m: number, step: number) =>
  Math.ceil(Math.round((c / 100) * r * m * 100) / 100 / step) * step * 100;

describe("computeAutoPrice", () => {
  it("пример Чертежа: $800 × 83.56 × 2.00 → 133 700 ₽ (13370000)", () => {
    assert.equal(computeAutoPrice(80000, 83.56, 2, 100), 13370000);
    assert.deepEqual(computeAutoPriceDetails(80000, 83.56, 2.0, 100), { exactKopecks: 13369600, price: 13370000 });
  });
  it("ровная сумма не округляется вверх (133 700 ₽ остаётся 133 700 ₽)", () => {
    assert.equal(computeAutoPrice(66850, 100, 2, 100), 13370000); // 668.50 × 100 × 2 = 133 700
  });
  it("округление вверх по price_rounding_rub: 1 / 10 / 100 / 1000", () => {
    // 800 × 83.5612 × 2 = 133 697.92 ₽
    assert.equal(computeAutoPrice(80000, 83.5612, 2, 1), 13369800);
    assert.equal(computeAutoPrice(80000, 83.5612, 2, 10), 13370000);
    assert.equal(computeAutoPrice(80000, 83.5612, 2, 100), 13370000);
    assert.equal(computeAutoPrice(80000, 83.5612, 2, 1000), 13400000);
  });
  it("RUB: курс 1; CNY: курс ЦБ за 1 юань", () => {
    assert.equal(computeAutoPrice(5000000, 1, 2, 100), 10000000); // 50 000 ₽ × 2
    assert.equal(computeAutoPrice(560000, 11.72, 2, 100), 13130000); // ¥5600 × 11.72 × 2 = 131 264 → 131 300
  });
  it("копейка округляется «половина вверх» до округления шага (как Math.round в Чертеже)", () => {
    // 0.01 × 0.5 × 1 = 0.005 ₽ = 0.5 коп → 1 коп → шаг 1 ₽ → 1 ₽
    assert.deepEqual(computeAutoPriceDetails(1, 0.5, 1, 1), { exactKopecks: 1, price: 100 });
    // 0.01 × 0.4 × 1 = 0.4 коп → 0 коп → ceil(0) = 0: формула Чертежа при такой закупке даёт 0 (на практике недостижимо)
    assert.deepEqual(computeAutoPriceDetails(1, 0.4, 1, 1), { exactKopecks: 0, price: 0 });
  });
  it("совпадает с формулой Чертежа на сетке значений, где float точен", () => {
    for (const cost of [100, 99999, 80000, 123456, 560000, 1500000]) {
      for (const rate of [1, 11.72, 83.56, 92.1234, 100.5]) {
        for (const m of [1, 1.5, 2, 2.35, 5]) {
          for (const step of [1, 10, 100, 1000]) {
            assert.equal(computeAutoPrice(cost, rate, m, step), blueprintFloat(cost, rate, m, step), `${cost} ${rate} ${m} ${step}`);
          }
        }
      }
    }
  });
  it("без float-ошибки: 1.1 × 3 (float 3.3000000000000003) не даёт лишний шаг", () => {
    // 1.10 RUB × 1 × 3.00 = 3.30 ₽ → шаг 0.01? нет — шаг 1 ₽: ceil(3.30) = 4 ₽; шаг 10: 10 ₽
    assert.equal(computeAutoPrice(110, 1, 3, 1), 400);
    // 3333.33 ₽ ровно: 1111.11 × 1 × 3 = 3333.33 → шаг 1 → 3334 ₽
    assert.equal(computeAutoPrice(111111, 1, 3, 1), 333400);
    // 100.00 × 1.1 × 3 = 330.00 ровно (float 330.00000000000006) → шаг 10 → 330 ₽, не 340
    assert.equal(computeAutoPrice(10000, 1.1, 3, 10), 33000);
  });
  it("результат — целое число копеек, кратное шагу", () => {
    const p = computeAutoPrice(123457, 92.1234, 2.35, 100);
    assert.ok(Number.isSafeInteger(p));
    assert.equal(p % 10000, 0);
  });
  it("некорректные аргументы → RangeError", () => {
    assert.throws(() => computeAutoPrice(0, 83.56, 2, 100), RangeError);
    assert.throws(() => computeAutoPrice(800.5, 83.56, 2, 100), RangeError);
    assert.throws(() => computeAutoPrice(80000, 0, 2, 100), RangeError);
    assert.throws(() => computeAutoPrice(80000, 83.56, 2, 0), RangeError);
    assert.throws(() => computeAutoPrice(80000, 83.56789, 2, 100), RangeError); // 5 знаков курса
    assert.throws(() => computeAutoPrice(80000, 83.56, 2.005, 100), RangeError); // 3 знака множителя
    assert.throws(() => computeAutoPrice(80000, Number.NaN, 2, 100), RangeError);
  });
});

describe("toScaledInt / minorUnitsToString", () => {
  it("точный перевод в целые", () => {
    assert.equal(toScaledInt(83.56, 4), BigInt(835600));
    assert.equal(toScaledInt(0.1 + 0.2, 1), BigInt(3));
    assert.equal(toScaledInt(2, 2), BigInt(200));
  });
  it("закупка в единицах валюты", () => {
    assert.equal(minorUnitsToString(80000), "800.00");
    assert.equal(minorUnitsToString(5), "0.05");
    assert.equal(minorUnitsToString(123456), "1234.56");
  });
});

describe("formatPriceCalculation (строка ответа POST /api/admin/products)", () => {
  it("дословно пример Блока 3", () => {
    const line = formatPriceCalculation(80000, "USD", 83.56, 2, 100);
    assert.equal(line, `800.00 USD × 83.5600 × 2.00 = ${formatRub(13369600)} → ${formatRub(13370000)}`);
    assert.equal(line.replace(/\s/g, " "), "800.00 USD × 83.5600 × 2.00 = 133 696 ₽ → 133 700 ₽");
  });
  it("дробная промежуточная сумма показывается с копейками", () => {
    const line = formatPriceCalculation(80000, "USD", 83.5612, 2, 100);
    assert.equal(line.replace(/\s/g, " "), "800.00 USD × 83.5612 × 2.00 = 133 697,92 ₽ → 133 700 ₽");
  });
  it("RUB и CNY", () => {
    assert.equal(formatPriceCalculation(5000000, "RUB", 1, 2, 100).replace(/\s/g, " "), "50000.00 RUB × 1.0000 × 2.00 = 100 000 ₽ → 100 000 ₽");
    assert.equal(formatPriceCalculation(560000, "CNY", 11.72, 2, 100).replace(/\s/g, " "), "5600.00 CNY × 11.7200 × 2.00 = 131 264 ₽ → 131 300 ₽");
  });
});
