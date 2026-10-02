import "server-only";
import { CATALOG_PAGE_SIZE } from "@/lib/config";
import { formatRub } from "@/lib/money";
import type { CartProduct } from "@/types/cart";
import type {
  Availability, CatalogContext, Construction, ProductDetail, ProductListItem, ProductsQuery,
  ProductSpecs, SeatType, VehicleDetail, VehicleOption,
} from "@/types/catalog";
import type { CatalogQueries } from "./catalog-queries";
import {
  FIXTURE_PRODUCTS, FIXTURE_VEHICLES, type FixtureProduct, type FixtureVehicle, type FixtureWheelSpecs,
} from "./catalog-fixtures-data";

// Демо-реализация контракта CatalogQueries: включается только при CATALOG_FIXTURES=1 и NODE_ENV !== "production".
// Необязательные dev-переключатели: CATALOG_FIXTURES_PER_PAGE (размер страницы вместо CATALOG_PAGE_SIZE, для проверки пагинации)
// и CATALOG_FIXTURES_ATELIER=1 (показывать price_atelier без сессии ателье).

const SEAT_LABELS: Record<SeatType, string> = {
  cone60: "Конус 60°", ball_r13: "Сфера R13", ball_r14: "Сфера R14", flat: "Плоская",
};
const CONSTRUCTION_LABELS: Record<Construction, string> = {
  cast: "Литой", flow_formed: "Flow-formed", forged_monoblock: "Кованый моноблок",
  forged_2pc: "Кованый составной 2PC", forged_3pc: "Кованый составной 3PC",
};
const IN_STOCK_DELIVERY = "Москва — 1–2 дня, регионы — 2–5 рабочих дней";

const currentYear = () => new Date().getFullYear();
const vehicleLabel = (v: FixtureVehicle): string =>
  `${v.make} ${v.model} ${v.generation} · ${v.year_from}–${v.year_to ?? "н.в."}`;
const toOption = (v: FixtureVehicle): VehicleOption => ({
  id: v.id, make: v.make, model: v.model, generation: v.generation,
  year_from: v.year_from, year_to: v.year_to, label: vehicleLabel(v),
});
const findVehicle = (id: string) => FIXTURE_VEHICLES.find((v) => v.id === id);

/** Правила 5.5 (find_wheels_for_vehicle): PCD, диаметр, ширина, вылет, ЦО (допуск 0.2 мм), посадка. */
function checkFit(w: FixtureWheelSpecs, v: FixtureVehicle): { fits: boolean; needsRings: boolean } {
  const inRange = (x: number, min: number, max: number) => x >= min && x <= max;
  const boreDiff = Math.round((w.center_bore_mm - v.center_bore_mm) * 10) / 10;
  const fits =
    w.pcd === v.pcd &&
    inRange(w.diameter_in, v.diameter_min_in, v.diameter_max_in) &&
    inRange(w.width_front_in, v.width_min_in, v.width_max_in) &&
    inRange(w.width_rear_in ?? w.width_front_in, v.width_min_in, v.width_max_in) &&
    inRange(w.et_front_mm, v.et_min_mm, v.et_max_mm) &&
    inRange(w.et_rear_mm ?? w.et_front_mm, v.et_min_mm, v.et_max_mm) &&
    boreDiff >= 0 &&
    (boreDiff <= 0.2 || w.includes_hub_rings) &&
    (w.seat_type === v.seat_type || w.includes_fasteners);
  return { fits, needsRings: boreDiff > 0.2 };
}

function fitmentFor(p: FixtureProduct, v: FixtureVehicle | undefined): { fits: boolean; needsRings: boolean } | null {
  if (!v) return null;
  if (p.wheel) return checkFit(p.wheel, v);
  return { fits: p.compatible_vehicle_ids?.includes(v.id) ?? false, needsRings: false };
}

// lead_time отдаётся и в списке (контракт допускает), чтобы бейдж «Под заказ · 21–35 дней» не зависел от delivery_text.
function availabilityOf(p: FixtureProduct): Availability {
  if (p.type === "carbon_part" && p.lead_time) {
    return {
      mode: "preorder", available_qty: null, status: "preorder", label: "Под заказ",
      delivery_text: `Срок поставки ${p.lead_time.min_days}–${p.lead_time.max_days} дней · 100% предоплата`,
      lead_time: p.lead_time,
    };
  }
  const inStock = p.stock_qty > 0;
  return {
    mode: "stock", available_qty: p.stock_qty, status: inStock ? "in_stock" : "out_of_stock",
    label: inStock ? "В наличии в Москве" : "Нет в наличии",
    delivery_text: inStock ? IN_STOCK_DELIVERY : null, lead_time: null,
  };
}

const num = (n: number) => String(n);
const pair = (a: number, b: number | null) => (b === null || b === a ? num(a) : `${a}/${b}`);

function specsShort(w: FixtureWheelSpecs): string {
  const widths = w.width_rear_in !== null && w.width_rear_in !== w.width_front_in
    ? `${w.width_front_in}J/${w.width_rear_in}J` : `${w.width_front_in}J`;
  return `R${w.diameter_in} · ${widths} · ${w.pcd.replace("x", "×")} · ET ${pair(w.et_front_mm, w.et_rear_mm)} · ЦО ${w.center_bore_mm.toFixed(1)}`;
}

const showAtelier = (ctx: CatalogContext) =>
  ctx.atelierId !== null || process.env.CATALOG_FIXTURES_ATELIER === "1";

function pricesOf(p: FixtureProduct, ctx: CatalogContext) {
  const atelier = showAtelier(ctx) ? p.price_atelier : null;
  return {
    price: p.price, price_formatted: formatRub(p.price),
    price_atelier: atelier, price_atelier_formatted: atelier === null ? null : formatRub(atelier),
  };
}

function toListItem(p: FixtureProduct, v: FixtureVehicle | undefined, ctx: CatalogContext): ProductListItem {
  const fit = fitmentFor(p, v);
  return {
    id: p.id, type: p.type, slug: p.slug, title: p.title, manufacturer: p.manufacturer,
    ...pricesOf(p, ctx),
    availability: availabilityOf(p),
    specs_short: p.wheel ? specsShort(p.wheel) : null,
    fitment: v && fit ? { vehicle_id: v.id, fits: fit.fits, needs_hub_rings: fit.needsRings } : null,
    cover_image: p.images[0] ?? null,
  };
}

const matchesConstruction = (p: FixtureProduct, c: NonNullable<ProductsQuery["construction"]>) => {
  const k = p.wheel?.construction;
  if (!k) return false;
  return c === "forged" ? k.startsWith("forged_") : k === c;
};

function listProducts(query: ProductsQuery, ctx: CatalogContext) {
  let vehicle: FixtureVehicle | undefined;
  if (query.vehicle) {
    vehicle = findVehicle(query.vehicle);
    if (!vehicle) return Promise.resolve({ kind: "vehicle_not_found" as const });
  }
  const perPage = Number(process.env.CATALOG_FIXTURES_PER_PAGE) || CATALOG_PAGE_SIZE;
  let items = FIXTURE_PRODUCTS.filter((p) => p.type === query.type);
  if (vehicle) items = items.filter((p) => fitmentFor(p, vehicle)?.fits === true);
  if (query.type === "wheel_set") {
    if (query.diameter) items = items.filter((p) => p.wheel?.diameter_in === query.diameter);
    if (query.construction) items = items.filter((p) => matchesConstruction(p, query.construction!));
  }
  if (query.availability === "in_stock") items = items.filter((p) => p.stock_qty > 0);

  const rank = (p: FixtureProduct) => (p.type === "wheel_set" && p.stock_qty === 0 ? 1 : 0); // in_stock выше out_of_stock
  const bySort: Record<ProductsQuery["sort"], (a: FixtureProduct, b: FixtureProduct) => number> = {
    price_asc: (a, b) => a.price - b.price,
    price_desc: (a, b) => b.price - a.price,
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
  };
  items = [...items].sort((a, b) => rank(a) - rank(b) || bySort[query.sort](a, b));

  const start = (query.page - 1) * perPage;
  return Promise.resolve({
    kind: "ok" as const,
    data: items.slice(start, start + perPage).map((p) => toListItem(p, vehicle, ctx)),
    meta: { total: items.length, page: query.page, per_page: perPage, vehicle_label: vehicle ? vehicleLabel(vehicle) : null },
  });
}

function toSpecs(w: FixtureWheelSpecs): ProductSpecs {
  return {
    diameter_in: w.diameter_in, width_front_in: w.width_front_in, width_rear_in: w.width_rear_in,
    et_front_mm: w.et_front_mm, et_rear_mm: w.et_rear_mm, pcd: w.pcd, center_bore_mm: w.center_bore_mm,
    seat_type: w.seat_type, seat_type_label: SEAT_LABELS[w.seat_type],
    construction: w.construction, construction_label: CONSTRUCTION_LABELS[w.construction],
    finish: w.finish, weight_kg: w.weight_kg,
    includes_hub_rings: w.includes_hub_rings, includes_fasteners: w.includes_fasteners,
  };
}

function getProductBySlug(slug: string, vehicleId: string | undefined, ctx: CatalogContext) {
  const p = FIXTURE_PRODUCTS.find((x) => x.slug === slug);
  if (!p) return Promise.resolve({ kind: "not_found" as const });
  let vehicle: FixtureVehicle | undefined;
  if (vehicleId) {
    vehicle = findVehicle(vehicleId);
    if (!vehicle) return Promise.resolve({ kind: "vehicle_not_found" as const });
  }
  const fit = fitmentFor(p, vehicle);
  const data: ProductDetail = {
    id: p.id, type: p.type, slug: p.slug, sku: p.sku, title: p.title, manufacturer: p.manufacturer,
    description: p.description, ...pricesOf(p, ctx),
    sold_as: p.type === "wheel_set" ? "Комплект из 4 дисков" : "1 шт.",
    availability: availabilityOf(p),
    specs: p.wheel ? toSpecs(p.wheel) : null,
    warranty_months: p.warranty_months, certifications: [],
    images: p.images.map((img, i) => ({ ...img, sort_order: i })),
    fitment: vehicle && fit ? {
      vehicle_id: vehicle.id, vehicle_label: vehicleLabel(vehicle), fits: fit.fits, needs_hub_rings: fit.needsRings,
      fastener_note: p.wheel && fit.fits && p.wheel.seat_type === vehicle.seat_type ? `Используйте штатные болты: ${vehicle.fastener_spec}` : null,
    } : null,
    compatible_vehicles: p.compatible_vehicle_ids
      ? p.compatible_vehicle_ids.flatMap((id) => { const v = findVehicle(id); return v ? [vehicleLabel(v)] : []; })
      : null,
  };
  return Promise.resolve({ kind: "ok" as const, data });
}

/** Все FIXTURE-товары — active; id вне списка (снятые/несуществующие) пропускаются → problem "unavailable". */
function getCartProducts(ids: string[], ctx: CatalogContext): CartProduct[] {
  const wanted = new Set(ids);
  return FIXTURE_PRODUCTS.filter((p) => wanted.has(p.id)).map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    type: p.type,
    availability_mode: p.type === "carbon_part" ? "preorder" : "stock",
    unit_price: showAtelier(ctx) ? p.price_atelier ?? p.price : p.price,
    available_qty: p.type === "carbon_part" ? null : p.stock_qty,
    cover_image_url: p.images[0]?.url ?? null,
  }));
}

const unique = (xs: string[]) => [...new Set(xs)];

export const fixtureQueries: CatalogQueries = {
  listMakes: async () => unique(FIXTURE_VEHICLES.map((v) => v.make)).sort(),
  listModels: async (make) => unique(FIXTURE_VEHICLES.filter((v) => v.make === make).map((v) => v.model)),
  listYears: async (make, model) => {
    const rows = FIXTURE_VEHICLES.filter((v) => v.make === make && v.model === model);
    if (rows.length === 0) return null;
    const from = Math.min(...rows.map((v) => v.year_from));
    const to = Math.max(...rows.map((v) => v.year_to ?? currentYear()));
    return Array.from({ length: to - from + 1 }, (_, i) => to - i);
  },
  resolveVehicle: async (make, model, year) =>
    FIXTURE_VEHICLES
      .filter((v) => v.make === make && v.model === model && v.year_from <= year && year <= (v.year_to ?? currentYear()))
      .sort((a, b) => a.year_from - b.year_from)
      .map(toOption),
  getVehicle: async (id): Promise<VehicleDetail | null> => {
    const v = findVehicle(id);
    return v ? { ...toOption(v), pcd: v.pcd, center_bore_mm: v.center_bore_mm, seat_type: v.seat_type,
      fastener_spec: v.fastener_spec, diameter_min_in: v.diameter_min_in, diameter_max_in: v.diameter_max_in,
      width_min_in: v.width_min_in, width_max_in: v.width_max_in, et_min_mm: v.et_min_mm, et_max_mm: v.et_max_mm } : null;
  },
  listProducts: async (query, ctx) => listProducts(query, ctx),
  getProductBySlug: async (slug, vehicleId, ctx) => getProductBySlug(slug, vehicleId, ctx),
  getCartProducts: async (ids, ctx) => getCartProducts(ids, ctx),
};
