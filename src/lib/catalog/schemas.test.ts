import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { productDetailQuery, productSlugParams, productsQuery } from "@/lib/schemas/catalog";
import { vehicleIdParams, vehicleModelsQuery, vehicleResolveQuery } from "@/lib/schemas/vehicles";

describe("productsQuery (Блок 3 «Каталог»)", () => {
  it("дефолты", () => {
    assert.deepEqual(productsQuery.parse({ type: "wheel_set" }), { type: "wheel_set", availability: "all", sort: "newest", page: 1 });
  });
  it("приведение чисел из query", () => {
    const q = productsQuery.parse({ type: "wheel_set", diameter: "20", page: "2", construction: "forged" });
    assert.equal(q.diameter, 20);
    assert.equal(q.page, 2);
  });
  it("неверный / отсутствующий type → поле type в fieldErrors (текст Zod как в Чертеже)", () => {
    for (const input of [{}, { type: "tyres" }]) {
      const r = productsQuery.safeParse(input);
      assert.equal(r.success, false);
      if (!r.success) {
        assert.deepEqual(z.flattenError(r.error).fieldErrors.type, ["Invalid option: expected one of \"wheel_set\"|\"carbon_part\""]);
      }
    }
  });
  it("vehicle — uuid; page ≥ 1", () => {
    assert.equal(productsQuery.safeParse({ type: "wheel_set", vehicle: "xyz" }).success, false);
    assert.equal(productsQuery.safeParse({ type: "wheel_set", page: "0" }).success, false);
  });
});

describe("схемы подбора и карточки", () => {
  it("неизвестная марка → текст Zod из Чертежа", () => {
    const r = vehicleModelsQuery.safeParse({ make: "Lada" });
    assert.equal(r.success, false);
    if (!r.success) assert.deepEqual(z.flattenError(r.error).fieldErrors.make, ["Invalid option: expected one of \"Audi\"|\"BMW\"|\"Mercedes-Benz\""]);
  });
  it("resolve: год приводится, вне 1990–2100 — ошибка", () => {
    assert.equal(vehicleResolveQuery.parse({ make: "BMW", model: " 5 Series ", year: "2017" }).model, "5 Series");
    assert.equal(vehicleResolveQuery.safeParse({ make: "BMW", model: "5 Series", year: "1989" }).success, false);
  });
  it("id авто — uuid; slug — kebab-case", () => {
    assert.equal(vehicleIdParams.safeParse({ id: "xyz" }).success, false);
    assert.equal(productSlugParams.safeParse({ slug: "forged-m01-r20-5x112-graphite" }).success, true);
    assert.equal(productSlugParams.safeParse({ slug: "Bad_Slug" }).success, false);
    assert.equal(productDetailQuery.safeParse({}).success, true);
  });
});
