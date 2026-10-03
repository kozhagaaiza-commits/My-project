import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { F10, G30, M4 } from "@/lib/catalog/__fixtures__/rows";
import { currentYearMoscow, distinctMakes, distinctModels, generationsForYear, toVehicleDetail, yearsForModel } from "@/lib/catalog/vehicles";

const g30 = { id: G30.id, make: G30.make, model: G30.model, generation: G30.generation, year_from: G30.year_from, year_to: G30.year_to };

describe("годы и поколения (Блок 3, 5.5)", () => {
  it("годы модели: от min(year_from) до max(year_to) по убыванию", () => {
    const years = yearsForModel([F10, g30], 2026);
    assert.equal(years?.[0], 2023);
    assert.equal(years?.at(-1), 2010);
    assert.equal(years?.length, 14);
  });
  it("year_to null → до текущего года", () => {
    assert.deepEqual(yearsForModel([M4], 2026), [2026, 2025, 2024, 2023, 2022, 2021]);
  });
  it("нет записей → null (404 «Модель не найдена»)", () => {
    assert.equal(yearsForModel([], 2026), null);
  });
  it("2017 у 5 Series → F10 и G30, по возрастанию year_from", () => {
    const gens = generationsForYear([g30, F10], 2017, 2026);
    assert.deepEqual(gens.map((g) => g.generation), ["F10", "G30"]);
    assert.equal(gens[1].label, "BMW 5 Series G30 · 2017–2023");
  });
  it("2020 → только G30; 1995 → пусто", () => {
    assert.deepEqual(generationsForYear([g30, F10], 2020, 2026).map((g) => g.generation), ["G30"]);
    assert.deepEqual(generationsForYear([g30, F10], 1995, 2026), []);
  });
  it("year_to null: текущий год входит, следующий — нет", () => {
    assert.equal(generationsForYear([M4], 2026, 2026).length, 1);
    assert.equal(generationsForYear([M4], 2027, 2026).length, 0);
    assert.equal(generationsForYear([M4], 2026, 2026)[0].label, "BMW M4 G82 · 2021–н.в.");
  });
  it("уникальные марки и модели, отсортированы", () => {
    assert.deepEqual(distinctMakes([{ make: "BMW" }, { make: "Audi" }, { make: "BMW" }, { make: "Mercedes-Benz" }]), ["Audi", "BMW", "Mercedes-Benz"]);
    assert.deepEqual(distinctModels([{ model: "X5" }, { model: "5 Series" }, { model: "M4" }, { model: "3 Series" }, { model: "M4" }]),
      ["3 Series", "5 Series", "M4", "X5"]);
  });
  it("текущий год по Москве: 31.12 21:30 UTC — уже следующий год", () => {
    assert.equal(currentYearMoscow(new Date("2026-12-31T21:30:00Z")), 2027);
    assert.equal(currentYearMoscow(new Date("2026-12-31T20:30:00Z")), 2026);
  });
  it("детали авто совпадают с JSON Чертежа", () => {
    const d = toVehicleDetail(G30);
    assert.equal(d.label, "BMW 5 Series G30 · 2017–2023");
    assert.equal(d.center_bore_mm, 66.6);
    assert.equal(d.fastener_spec, "Болт M14×1.25");
  });
});
