import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogHref, parseCatalogParams, pluralPositions } from "@/components/shop/catalog/catalog-params";

const VEHICLE = "10000000-0000-4000-8000-000000000008";

describe("parseCatalogParams", () => {
  it("пустые параметры → значения по умолчанию", () => {
    const r = parseCatalogParams("wheel_set", {});
    assert.deepEqual(r.query, { type: "wheel_set", availability: "all", sort: "newest", page: 1 });
    assert.equal(r.vehicleInvalid, false);
    assert.equal(r.hasFilters, false);
  });

  it("валидные параметры разбираются, hasFilters включается", () => {
    const r = parseCatalogParams("wheel_set", {
      vehicle: VEHICLE, diameter: "20", construction: "forged", availability: "in_stock", sort: "price_asc", page: "3",
    });
    assert.equal(r.query.vehicle, VEHICLE);
    assert.equal(r.query.diameter, 20);
    assert.equal(r.query.construction, "forged");
    assert.equal(r.query.availability, "in_stock");
    assert.equal(r.query.sort, "price_asc");
    assert.equal(r.query.page, 3);
    assert.equal(r.hasFilters, true);
  });

  it("невалидный vehicle отбрасывается и помечается vehicleInvalid", () => {
    const r = parseCatalogParams("wheel_set", { vehicle: "garbage", diameter: "19" });
    assert.equal(r.query.vehicle, undefined);
    assert.equal(r.vehicleInvalid, true);
    assert.equal(r.query.diameter, 19); // остальные валидные поля сохраняются
  });

  it("пустой ?vehicle= = параметра нет (не invalid)", () => {
    const r = parseCatalogParams("wheel_set", { vehicle: "" });
    assert.equal(r.query.vehicle, undefined);
    assert.equal(r.vehicleInvalid, false);
  });

  it("невалидные page, diameter, sort, construction отбрасываются", () => {
    for (const page of ["0", "-1", "abc", "1001", "1.5"]) {
      assert.equal(parseCatalogParams("wheel_set", { page }).query.page, 1, `page=${page}`);
    }
    for (const diameter of ["99", "abc", "10", "20.5"]) {
      assert.equal(parseCatalogParams("wheel_set", { diameter }).query.diameter, undefined, `diameter=${diameter}`);
    }
    assert.equal(parseCatalogParams("wheel_set", { sort: "cheap" }).query.sort, "newest");
    assert.equal(parseCatalogParams("wheel_set", { construction: "titan" }).query.construction, undefined);
    assert.equal(parseCatalogParams("wheel_set", { availability: "yes" }).query.availability, "all");
  });

  it("несколько невалидных полей сразу: страница не падает", () => {
    const r = parseCatalogParams("wheel_set", { vehicle: "x", page: "0", diameter: "99", sort: "zzz" });
    assert.deepEqual(r.query, { type: "wheel_set", availability: "all", sort: "newest", page: 1 });
    assert.equal(r.vehicleInvalid, true);
    assert.equal(r.hasFilters, false);
  });

  it("повторяющийся параметр: берётся первое значение", () => {
    assert.equal(parseCatalogParams("wheel_set", { diameter: ["21", "18"] }).query.diameter, 21);
  });

  it("карбон: фильтры дисков игнорируются, vehicle/sort/page работают", () => {
    const r = parseCatalogParams("carbon_part", {
      vehicle: VEHICLE, diameter: "20", construction: "cast", availability: "in_stock", sort: "price_desc", page: "2",
    });
    assert.deepEqual(r.query, { type: "carbon_part", vehicle: VEHICLE, availability: "all", sort: "price_desc", page: 2 });
    assert.equal(r.hasFilters, false);
  });
});

describe("pluralPositions", () => {
  const cases: Array<[number, string]> = [
    [0, "0 позиций"], [1, "1 позиция"], [2, "2 позиции"], [4, "4 позиции"], [5, "5 позиций"],
    [11, "11 позиций"], [12, "12 позиций"], [14, "14 позиций"], [21, "21 позиция"], [22, "22 позиции"],
    [25, "25 позиций"], [101, "101 позиция"], [111, "111 позиций"],
  ];
  for (const [n, expected] of cases) {
    it(`${n} → ${expected}`, () => assert.equal(pluralPositions(n), expected));
  }
});

describe("catalogHref", () => {
  it("без параметров — просто путь каталога", () => {
    assert.equal(catalogHref("wheel_set", {}), "/wheels");
    assert.equal(catalogHref("carbon_part", {}), "/carbon");
  });

  it("значения по умолчанию в URL не пишутся", () => {
    assert.equal(catalogHref("wheel_set", { availability: "all", sort: "newest", page: 1 }), "/wheels");
  });

  it("смена фильтра сохраняет vehicle и сбрасывает page", () => {
    const { query } = parseCatalogParams("wheel_set", { vehicle: VEHICLE, diameter: "20", sort: "price_asc", page: "3" });
    const href = catalogHref("wheel_set", { ...query, construction: "forged", page: 1 });
    const url = new URL(href, "http://localhost");
    assert.equal(url.pathname, "/wheels");
    assert.equal(url.searchParams.get("vehicle"), VEHICLE);
    assert.equal(url.searchParams.get("diameter"), "20");
    assert.equal(url.searchParams.get("construction"), "forged");
    assert.equal(url.searchParams.get("sort"), "price_asc");
    assert.equal(url.searchParams.has("page"), false);
  });

  it("страница > 1 попадает в URL", () => {
    assert.equal(catalogHref("carbon_part", { vehicle: VEHICLE, page: 2 }), `/carbon?vehicle=${VEHICLE}&page=2`);
  });

  it("«Сбросить фильтры»: остаётся только vehicle", () => {
    assert.equal(catalogHref("wheel_set", { vehicle: VEHICLE }), `/wheels?vehicle=${VEHICLE}`);
  });
});
