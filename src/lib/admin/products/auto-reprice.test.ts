import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autoRepriceAfterRates } from "@/lib/admin/products/auto-reprice";
import { C1, FakeProductsDb, P1, carbonProduct, wheelProduct } from "@/lib/admin/products/__fixtures__/fake-repo";

// Автопересчёт (5.4, 5.12 шаг 2): auto_reprice и сдвиг курса ≥ reprice_threshold % относительно курса на дату price_updated_at.

const NOW = new Date("2026-10-03T06:00:00.000Z");
const ON = { auto_reprice: true, reprice_threshold: 2 };

function world(usd: number, cny = 11.72) {
  // Цены посчитаны по USD 83.56 / CNY 11.72 на 2026-10-01 (price_updated_at = T0).
  const db = new FakeProductsDb(wheelProduct(), carbonProduct());
  db.ratesHistory = [
    { currency: "USD", rate: 83.56, rate_date: "2026-10-01" },
    { currency: "CNY", rate: 11.72, rate_date: "2026-10-01" },
  ];
  db.rates.set("USD", { currency: "USD", rate: usd, rate_date: "2026-10-03" });
  db.rates.set("CNY", { currency: "CNY", rate: cny, rate_date: "2026-10-03" });
  return db;
}

describe("autoRepriceAfterRates", () => {
  it("auto_reprice выключен → ничего не читается и не пишется", async () => {
    const db = world(90);
    const out = await autoRepriceAfterRates(db, { auto_reprice: false, reprice_threshold: 2 }, NOW);
    assert.deepEqual(out, { enabled: false, currencies: [], repriced_products: 0, skipped_products: 0 });
    assert.equal(db.called("updateAutoPrice").length, 0);
    assert.equal(db.called("listAutoPriced").length, 0);
  });

  it("сдвиг ниже порога (1,1 %) → цены не меняются", async () => {
    const db = world(84.5);
    const out = await autoRepriceAfterRates(db, ON, NOW);
    assert.equal(out.repriced_products, 0);
    assert.deepEqual(out.currencies, []);
    assert.equal(db.products.get(P1)?.price, 13370000);
    assert.equal(db.called("updateAutoPrice").length, 0);
  });

  it("сдвиг ≥ порога (2,3 %) → пересчёт товаров этой валюты; CNY-товар не трогается", async () => {
    const db = world(85.5); // 800 × 85.5 × 2 = 136 800 ₽
    const out = await autoRepriceAfterRates(db, ON, NOW);
    assert.deepEqual(out.currencies, ["USD"]);
    assert.equal(out.repriced_products, 1);
    assert.equal(db.products.get(P1)?.price, 13680000);
    assert.equal(db.products.get(P1)?.price_updated_at, NOW.toISOString());
    assert.equal(db.products.get(C1)?.price, 13130000);
    assert.equal(db.called("updateAutoPrice").length, 1);
  });

  it("порог ровно 2,00 % срабатывает (≥), повтор после пересчёта — без изменений (идемпотентно)", async () => {
    const db = world(85.2312); // 83.56 × 1.02 = 85.2312
    assert.equal((await autoRepriceAfterRates(db, ON, NOW)).repriced_products, 1);
    // price_updated_at теперь NOW (2026-10-03): курс на эту дату = текущий → сдвиг 0
    const again = await autoRepriceAfterRates(db, ON, NOW);
    assert.equal(again.repriced_products, 0);
    assert.deepEqual(again.currencies, []);
  });

  it("manual-товары не пересчитываются; цена ателье выше новой розницы → skipped, не пишется", async () => {
    const db = new FakeProductsDb(
      wheelProduct({ price_atelier: 13600000 }),
      wheelProduct({ id: "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b", slug: "m", sku: "M-1", pricing_mode: "manual", price: 9900000, price_atelier: null }),
    );
    db.ratesHistory = [{ currency: "USD", rate: 83.56, rate_date: "2026-10-01" }];
    db.rates.set("USD", { currency: "USD", rate: 80, rate_date: "2026-10-03" }); // −4,3 %: 128 000 ₽ < 136 000 ₽ ателье
    const out = await autoRepriceAfterRates(db, ON, NOW);
    assert.equal(out.repriced_products, 0);
    assert.equal(out.skipped_products, 1);
    assert.equal(db.products.get(P1)?.price, 13370000);
  });

  it("нет курса валюты → цены этой валюты не трогаются; нет курса на дату расчёта цены → пересчёт", async () => {
    const db = new FakeProductsDb(wheelProduct());
    db.rates.delete("USD");
    assert.equal((await autoRepriceAfterRates(db, ON, NOW)).repriced_products, 0);
    db.rates.set("USD", { currency: "USD", rate: 83.56, rate_date: "2026-10-03" }); // история пуста: опоры на 01.10 нет
    const out = await autoRepriceAfterRates(db, ON, NOW);
    assert.deepEqual(out.currencies, ["USD"]);
    assert.equal(out.repriced_products, 0); // цена уже соответствует курсу — unchanged
  });
});
