import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPricePreview, computeAutoPrice } from "./price-preview";
import type { AdminSettings } from "./types";

const settings: AdminSettings = {
  markup_multiplier: 2, price_rounding_rub: 100, auto_reprice: true, reprice_threshold: 2,
  rates: { USD: { rate: 83.56, date: "2026-10-01" } }, updated_at: "2026-10-01T06:00:00.000Z",
};
const nbsp = (s: string) => s.replace(/[  ]/g, " ");

describe("computeAutoPrice", () => {
  it("пример Чертежа: 800 USD × 83.56 × 2 → 133 700 ₽", () => {
    assert.equal(computeAutoPrice(80000, 83.56, 2, 100), 13370000);
  });
  it("округляет вверх до шага", () => {
    assert.equal(computeAutoPrice(10000, 1, 1.01, 100), 20000);
    assert.equal(computeAutoPrice(10000, 1, 1, 100), 10000);
  });
});

describe("buildPricePreview", () => {
  it("строка расчёта как в Блоке 4", () => {
    const p = buildPricePreview(80000, "USD", settings);
    assert.equal(p.kind, "ok");
    if (p.kind === "ok") {
      assert.equal(nbsp(p.line), "800.00 USD × 83,5600 × 2.00 = 133 696 ₽ → 133 700 ₽");
      assert.equal(p.priceKopecks, 13370000);
    }
  });
  it("нет курса → no_rate; RUB считается по курсу 1", () => {
    assert.equal(buildPricePreview(80000, "CNY", settings).kind, "no_rate");
    assert.equal(buildPricePreview(80000, "USD", null).kind, "no_rate");
    const rub = buildPricePreview(5000000, "RUB", settings);
    assert.equal(rub.kind === "ok" ? rub.priceKopecks : -1, 10000000);
  });
  it("пустая закупка → empty", () => {
    assert.equal(buildPricePreview(undefined, "USD", settings).kind, "empty");
  });
});
