import type { ProductRow, VehicleOptionRow, VehicleRow } from "@/lib/catalog/rows";

// Строки БД для тестов чистых функций каталога (значения — из JSON-примеров Блока 3 и seed).

export function wheelRow(over: Partial<ProductRow> = {}): ProductRow {
  return {
    id: "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", type: "wheel_set", slug: "forged-m01-r20-5x112-graphite",
    sku: "FCF-M01-2085-GR", title: "Кованый моноблок M-01 R20, 5×112, графит", manufacturer: "ForgeCarbon Forged",
    description: "Кованый моноблок.", status: "active", availability_mode: "stock", stock_qty: 3,
    lead_time_min_days: null, lead_time_max_days: null, price: 13370000, price_atelier: 11800000,
    diameter_in: 20, width_front_in: 8.5, width_rear_in: 9.5, et_front_mm: 30, et_rear_mm: 40, pcd: "5x112",
    center_bore_mm: 66.6, seat_type: "cone60", includes_hub_rings: false, includes_fasteners: false,
    construction: "forged_monoblock", finish: "Графит, сатин", weight_kg: 9.8, warranty_months: 24,
    certifications: ["JWL", "VIA"], claims_verified: false, created_at: "2026-09-01T10:00:00Z",
    ...over,
  };
}

export function carbonRow(over: Partial<ProductRow> = {}): ProductRow {
  return wheelRow({
    id: "a3e9c1b7-2d4f-4e8a-b6c0-1f7d9e3a5b28", type: "carbon_part", slug: "bmw-m4-g82-carbon-rear-diffuser",
    sku: "FCC-G82-DIF-01", title: "Задний диффузор, карбон, BMW M4 G82/G83", manufacturer: "ForgeCarbon Carbon",
    availability_mode: "preorder", stock_qty: 0, lead_time_min_days: 21, lead_time_max_days: 35, price: 9860000,
    price_atelier: null, diameter_in: null, width_front_in: null, width_rear_in: null, et_front_mm: null,
    et_rear_mm: null, pcd: null, center_bore_mm: null, seat_type: null, construction: null, finish: null,
    weight_kg: null, warranty_months: 12, certifications: [],
    ...over,
  });
}

export const G30: VehicleRow = {
  id: "6f2d8a41-9c3e-4b75-a0d2-3e8f1c7b9d64", make: "BMW", model: "5 Series", generation: "G30",
  year_from: 2017, year_to: 2023, pcd: "5x112", center_bore_mm: 66.6, seat_type: "cone60",
  fastener_spec: "Болт M14×1.25", diameter_min_in: 18, diameter_max_in: 21, width_min_in: 8, width_max_in: 10,
  et_min_mm: 20, et_max_mm: 40,
};

export const F10: VehicleOptionRow = {
  id: "1b7e3c90-4d2a-4f61-8a35-0c9e7d2f5a18", make: "BMW", model: "5 Series", generation: "F10", year_from: 2010, year_to: 2017,
};

export const M4: VehicleOptionRow = {
  id: "c8b2e5d1-7f3a-4c9e-a1d6-4b0e8f2c7a95", make: "BMW", model: "M4", generation: "G82", year_from: 2021, year_to: null,
};
