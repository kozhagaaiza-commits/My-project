import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildProductBody, productErrorMap, splitProductFieldErrors } from "./product-form-body";
import { fittingVehicles } from "./fitment-preview";
import { EMPTY_PRODUCT_VALUES, EMPTY_WHEEL, type ProductFormValues } from "./product-form-values";
import { productUpsertBody } from "./schemas";
import { buildVehicleBody, EMPTY_VEHICLE_VALUES } from "./vehicle-form";
import { vehicleUpsertBody } from "./schemas";
import { FIXTURE_VEHICLES } from "@/lib/catalog-fixtures-data";
import type { AdminVehicleRow } from "./types";

const wheelValues = (over: Partial<ProductFormValues> = {}): ProductFormValues => ({
  ...EMPTY_PRODUCT_VALUES,
  title: "Кованый моноблок M-01", manufacturer: "ForgeCarbon Forged", sku: "fcf-m01", slug: "forged-m01",
  stock_qty: "4", purchase_cost: "800.00",
  wheel: {
    ...EMPTY_WHEEL, diameter_in: "20", width_front_in: "8.5", width_rear_in: "9.5", et_front_mm: "30", et_rear_mm: "40",
    pcd: "5x112", center_bore_mm: "66.6", seat_type: "cone60", construction: "forged_monoblock",
  },
  ...over,
});

const vehicles: AdminVehicleRow[] = FIXTURE_VEHICLES.map((v) => ({
  ...v, make: v.make as AdminVehicleRow["make"], is_active: true, fitting_products_count: 0,
}));

describe("buildProductBody + productUpsertBody", () => {
  it("валидная форма дисков проходит схему сервера", () => {
    const r = productUpsertBody.safeParse(buildProductBody(wheelValues(), "draft"));
    assert.ok(r.success, JSON.stringify(r.success ? null : r.error.issues));
    if (r.success) {
      assert.equal(r.data.purchase_cost, 80000);
      assert.equal(r.data.sku, "FCF-M01");
      assert.equal(r.data.price, null);
      assert.equal(r.data.wheel?.et_rear_mm, 40);
    }
  });
  it("пустые поля дают понятные ошибки с путями формы", () => {
    const r = productUpsertBody.safeParse(buildProductBody(EMPTY_PRODUCT_VALUES, "draft"), { error: productErrorMap });
    assert.ok(!r.success);
    if (!r.success) {
      const byPath = new Map(r.error.issues.map((i) => [i.path.join("."), i.message]));
      assert.equal(byPath.get("wheel.diameter_in"), "Заполните поле");
      assert.equal(byPath.get("purchase_cost"), "Укажите закупку");
      assert.equal(byPath.get("title"), "Минимум 3 симв.");
    }
  });
  it("карбон: только под заказ, wheel = null, совместимость уходит в тело", () => {
    const body = buildProductBody(
      wheelValues({ type: "carbon_part", lead_time_min_days: "21", lead_time_max_days: "35", compatible_vehicle_ids: [vehicles[0].id] }),
      "draft",
    );
    assert.equal(body.wheel, null);
    assert.equal(body.availability_mode, "preorder");
    assert.deepEqual(body.compatible_vehicle_ids, [vehicles[0].id]);
  });
  it("режим «Вручную» без цены — ошибка схемы", () => {
    const r = productUpsertBody.safeParse(buildProductBody(wheelValues({ pricing_mode: "manual" }), "draft"));
    assert.ok(!r.success);
  });
});

describe("splitProductFieldErrors", () => {
  it("раскладывает известные поля и отдельно images", () => {
    const { fields, unmapped } = splitProductFieldErrors({ fields: { "wheel.pcd": ["Формат 5x112"], images: ["Добавьте хотя бы одно фото"] } });
    assert.deepEqual(fields, [{ name: "wheel.pcd", message: "Формат 5x112" }]);
    assert.deepEqual(unmapped, [{ name: "images", message: "Добавьте хотя бы одно фото" }]);
    assert.deepEqual(splitProductFieldErrors(undefined), { fields: [], unmapped: [] });
  });
});

describe("fittingVehicles", () => {
  const names = (v: ProductFormValues) => fittingVehicles(v, vehicles)?.map((x) => `${x.make} ${x.model} ${x.generation}`);
  it("R20 5x112 ET30/40 ЦО 66.6 конус: BMW G20 и G30 (по правилам find_wheels_for_vehicle)", () => {
    const list = names(wheelValues());
    assert.ok(list?.includes("BMW 3 Series G20"));
    assert.ok(list?.includes("BMW 5 Series G30"));
    assert.ok(!list?.includes("BMW 5 Series F10"), "PCD 5x120 не подходит");
    assert.ok(!list?.includes("Audi A4 B9"), "сфера R13 без своего крепежа не подходит");
  });
  it("свой крепёж снимает ограничение посадки (Audi A6 C8: сфера R13)", () => {
    const base = wheelValues();
    assert.ok(!names(base)?.includes("Audi A6 C8"));
    assert.ok(names({ ...base, wheel: { ...base.wheel, includes_fasteners: true } })?.includes("Audi A6 C8"));
  });
  it("неполные параметры → null; неактивные авто не считаются", () => {
    assert.equal(fittingVehicles(EMPTY_PRODUCT_VALUES, vehicles), null);
    assert.deepEqual(fittingVehicles(wheelValues(), vehicles.map((v) => ({ ...v, is_active: false }))), []);
  });
});

describe("buildVehicleBody + vehicleUpsertBody", () => {
  it("валидная форма; year_to пусто → null", () => {
    const r = vehicleUpsertBody.safeParse(buildVehicleBody({
      ...EMPTY_VEHICLE_VALUES, make: "BMW", model: "7 Series", generation: "G11", year_from: "2015", pcd: "5x112",
      center_bore_mm: "66.6", seat_type: "cone60", fastener_spec: "Болт M14×1.25", diameter_min_in: "18", diameter_max_in: "21",
      width_min_in: "8", width_max_in: "10", et_min_mm: "20", et_max_mm: "45",
    }));
    assert.ok(r.success, JSON.stringify(r.success ? null : r.error.issues));
    if (r.success) assert.equal(r.data.year_to, null);
  });
});
