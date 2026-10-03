import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProductsFilters, parseVehiclesFilters, productsApiUrl, productsPageHref, vehiclesApiUrl, vehiclesPageHref } from "./list-query";

describe("фильтры товаров", () => {
  it("значения по умолчанию и мусор", () => {
    assert.deepEqual(parseProductsFilters({}), { type: "wheel_set", status: null, q: "", page: 1 });
    assert.deepEqual(parseProductsFilters({ type: "x", status: "zzz", page: "-3", q: " a " }), { type: "wheel_set", status: null, q: "a", page: 1 });
  });
  it("API-ссылка: короткий q отбрасывается", () => {
    assert.equal(productsApiUrl({ type: "wheel_set", status: null, q: "a", page: 1 }), "/api/admin/products?type=wheel_set&page=1");
    assert.equal(
      productsApiUrl({ type: "carbon_part", status: "draft", q: "m-01", page: 2 }),
      "/api/admin/products?type=carbon_part&page=2&status=draft&q=m-01",
    );
  });
  it("ссылка страницы без значений по умолчанию", () => {
    assert.equal(productsPageHref({ type: "wheel_set", status: null, q: "", page: 1 }), "/admin/products");
    assert.equal(productsPageHref({ type: "carbon_part", status: "active", q: "", page: 3 }), "/admin/products?type=carbon_part&status=active&page=3");
  });
});

describe("фильтры автомобилей", () => {
  it("разбор и сборка", () => {
    const f = parseVehiclesFilters({ make: "BMW", q: "5 Series", page: "2" });
    assert.deepEqual(f, { make: "BMW", q: "5 Series", page: 2 });
    assert.equal(vehiclesApiUrl(f), "/api/admin/vehicles?page=2&make=BMW&q=5+Series");
    assert.equal(vehiclesPageHref({ make: null, q: "", page: 1 }), "/admin/vehicles");
    assert.equal(parseVehiclesFilters({ make: "Lada" }).make, null);
  });
});
