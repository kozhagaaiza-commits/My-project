import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PG_INT_MAX, kopecks } from "@/lib/schemas/common";
import { createOrderBody } from "@/lib/schemas/orders";

// kopecks: целые копейки в пределах integer Postgres (иначе 22003 numeric_value_out_of_range → 500).

describe("kopecks", () => {
  it("граница — 2 147 483 647 (integer)", () => {
    assert.equal(PG_INT_MAX, 2 ** 31 - 1);
    assert.equal(kopecks.safeParse(2_147_483_647).success, true);
    assert.equal(kopecks.safeParse(2_147_483_648).success, false);
    assert.equal(kopecks.safeParse(100_000_000_00).success, false);
  });

  it("положительное целое: 1 и 13370000 — да; 0, -1, 1.5, строка — нет", () => {
    for (const v of [1, 13370000]) assert.equal(kopecks.safeParse(v).success, true);
    for (const v of [0, -1, 1.5, "13370000", Number.NaN]) assert.equal(kopecks.safeParse(v).success, false);
  });

  it("createOrderBody.expected_total вне integer → 400-ошибка поля, а не 500 из БД", () => {
    const body = {
      client_request_id: "0e7c4a19-5b2d-4f8e-9a63-1d0c8b7e2f45",
      items: [{ product_id: "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", quantity: 1 }],
      expected_total: 13370000,
      customer: { name: "Артём Соколов", phone: "+7 916 555-12-34", email: "artem.sokolov@yandex.ru" },
      delivery: { method: "cdek_pvz", city: "Казань", cdek_pvz_code: "KZN45", address: null, postal_code: null },
      vehicle_id: null, vin: null, comment: null, consent_pd: true, consent_offer: true,
    };
    assert.equal(createOrderBody.safeParse(body).success, true);
    const res = createOrderBody.safeParse({ ...body, expected_total: 3_000_000_000 });
    assert.equal(res.success, false);
    assert.deepEqual(res.error?.issues.map((i) => i.path.join(".")), ["expected_total"]);
  });
});
