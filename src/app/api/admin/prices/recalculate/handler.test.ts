import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRecalculateHandler } from "@/app/api/admin/prices/recalculate/handler";
import { C1, FakeProductsDb, P1, carbonProduct, fakeDeps, json, jsonReq, wheelProduct } from "@/lib/admin/products/__fixtures__/fake-repo";
import { formatRub } from "@/lib/money";

// POST /api/admin/prices/recalculate (Блок 3; 5.4): та же computeAutoPrice, только pricing_mode = 'auto'.

const req = (body: unknown) => jsonReq("POST", "/api/admin/prices/recalculate", body);
const MANUAL = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";

function setup() {
  // Курс USD вырос: 84.50 × 800 × 2 = 135 200 ₽ (пример Блока 3: 133 700 → 135 200).
  const db = new FakeProductsDb(
    wheelProduct(),
    carbonProduct(), // CNY: 5600 × 11.72 × 2 = 131 264 → 131 300 — без изменений
    wheelProduct({ id: MANUAL, slug: "m", sku: "MAN-1", pricing_mode: "manual", price: 9900000, price_atelier: null }),
  );
  db.rates.set("USD", { currency: "USD", rate: 84.5, rate_date: "2026-10-02" });
  return db;
}

describe("POST /api/admin/prices/recalculate", () => {
  it("dry_run: изменения и unchanged, без записи", async () => {
    const db = setup();
    const { status, body } = await json(await createRecalculateHandler(fakeDeps(db).deps).POST(req({ dry_run: true })));
    assert.equal(status, 200);
    assert.deepEqual(body, {
      data: {
        dry_run: true,
        changes: [{
          product_id: P1, title: "Кованый моноблок M-01 R20, 5×112, графит",
          old_price: 13370000, old_price_formatted: formatRub(13370000), new_price: 13520000, new_price_formatted: formatRub(13520000),
        }],
        unchanged: 1,
        skipped: [],
      },
    });
    assert.equal(db.called("updateAutoPrice").length, 0);
    assert.equal(db.products.get(P1)?.price, 13370000);
  });

  it("применение: price и price_updated_at только у изменившихся auto; manual не трогается", async () => {
    const db = setup();
    const { body } = await json(await createRecalculateHandler(fakeDeps(db).deps).POST(req({ dry_run: false })));
    assert.equal((body.data as { changes: unknown[] }).changes.length, 1);
    assert.equal(db.products.get(P1)?.price, 13520000);
    assert.equal(db.products.get(P1)?.price_updated_at, "2026-10-01T09:41:17.000Z");
    assert.equal(db.products.get(MANUAL)?.price, 9900000);
    assert.equal(db.products.get(C1)?.price, 13130000);
    assert.deepEqual(db.called("updateAutoPrice").map((c) => c.slice(1)), [[P1, 13370000, 13520000, "2026-10-01T09:41:17.000Z"]]);
  });

  it("нет курса нужной валюты → 422 «Курс USD не загружен»", async () => {
    const db = setup();
    db.rates.delete("USD");
    const { status, body } = await json(await createRecalculateHandler(fakeDeps(db).deps).POST(req({ dry_run: true })));
    assert.equal(status, 422);
    assert.deepEqual(body, { error: { code: "RATE_NOT_LOADED", message: "Курс USD не загружен" } });
  });

  it("курса CNY нет, но CNY-товаров в auto нет → пересчёт идёт", async () => {
    const db = new FakeProductsDb(wheelProduct());
    db.rates.delete("CNY");
    assert.equal((await createRecalculateHandler(fakeDeps(db).deps).POST(req({ dry_run: true }))).status, 200);
  });

  it("цена ателье выше новой розницы → в skipped, не пишется (BR-09)", async () => {
    const db = new FakeProductsDb(wheelProduct({ price_atelier: 13300000 }));
    db.rates.set("USD", { currency: "USD", rate: 80, rate_date: "2026-10-02" }); // 128 000 ₽ < 133 000 ₽ ателье
    const { body } = await json(await createRecalculateHandler(fakeDeps(db).deps).POST(req({ dry_run: false })));
    const d = body.data as { changes: unknown[]; skipped: Array<{ product_id: string; reason: string }> };
    assert.deepEqual(d.changes, []);
    assert.deepEqual(d.skipped.map((s) => s.product_id), [P1]);
    assert.equal(db.called("updateAutoPrice").length, 0);
  });

  it("товар изменили во время пересчёта → skipped", async () => {
    const db = setup();
    db.updateAutoPrice = async () => false;
    const { body } = await json(await createRecalculateHandler(fakeDeps(db).deps).POST(req({ dry_run: false })));
    assert.deepEqual((body.data as { skipped: Array<{ reason: string }> }).skipped.map((s) => s.reason), ["Товар изменили во время пересчёта"]);
  });

  it("нет dry_run → 400 VALIDATION_ERROR", async () => {
    assert.equal((await createRecalculateHandler(fakeDeps(setup()).deps).POST(req({}))).status, 400);
  });
});
