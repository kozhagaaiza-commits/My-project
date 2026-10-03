// Демо-данные админки товаров и автомобилей (только для разработки без Supabase: ADMIN_FIXTURES=1 вне production).
// Модуль нигде не импортируется приложением — его читает Playwright-smoke через route.fulfill на /api/admin/*,
// поэтому в production-бандл он не попадает.
import { FIXTURE_VEHICLES } from "@/lib/catalog-fixtures-data";
import { carbonImage, discImage, type CarbonKind, type DiscFinish } from "@/lib/catalog-fixtures-images";
import type {
  AdminImage, AdminProductDetail, AdminProductStatus, AdminVehicleRow, PurchaseCurrency,
} from "@/lib/admin-products-ui/types";
import type { AdminProductRecord } from "@/lib/admin-products-fixtures/store";

export const FIXTURE_BASE_TIME = "2026-10-01T09:05:00.000Z";
export const productId = (n: number) => `a1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const imageId = (p: number, i: number) => `b1000000-0000-4000-8000-${String(p * 10 + i).padStart(12, "0")}`;

export function fixtureVehicles(): AdminVehicleRow[] {
  return FIXTURE_VEHICLES.map((v) => ({
    ...v, make: v.make as AdminVehicleRow["make"], is_active: v.generation !== "F30", fitting_products_count: 0,
  }));
}

interface WheelTemplate {
  title: string; finish: DiscFinish; diameter: number; wf: number; wr: number | null; etf: number; etr: number | null;
  pcd: string; bore: number; seat: AdminVehicleRow["seat_type"]; construction: "forged_monoblock" | "forged_2pc" | "flow_formed" | "cast";
  usd: number; hubRings?: boolean; fasteners?: boolean;
}

const WHEELS: WheelTemplate[] = [
  { title: "Кованый моноблок M-01 R20, 5×112, графит", finish: "graphite", diameter: 20, wf: 8.5, wr: 9.5, etf: 30, etr: 40, pcd: "5x112", bore: 66.6, seat: "cone60", construction: "forged_monoblock", usd: 80000 },
  { title: "Кованый моноблок M-02 R19, 5×112, серебро", finish: "silver", diameter: 19, wf: 8.5, wr: 9.5, etf: 35, etr: 40, pcd: "5x112", bore: 66.6, seat: "cone60", construction: "forged_monoblock", usd: 72000 },
  { title: "Кованый составной S-05 R21, 5×112, бронза", finish: "bronze", diameter: 21, wf: 9, wr: 10.5, etf: 25, etr: 35, pcd: "5x112", bore: 66.6, seat: "ball_r13", construction: "forged_2pc", usd: 110000, fasteners: true },
  { title: "Flow forming F-12 R18, 5×120, чёрный", finish: "black", diameter: 18, wf: 8, wr: null, etf: 30, etr: null, pcd: "5x120", bore: 72.6, seat: "cone60", construction: "flow_formed", usd: 38000 },
  { title: "Литой C-30 R19, 5×112, ганметал", finish: "gunmetal", diameter: 19, wf: 8.5, wr: null, etf: 35, etr: null, pcd: "5x112", bore: 66.6, seat: "ball_r14", construction: "cast", usd: 29000 },
  { title: "Кованый моноблок M-03 R22, 5×112, полировка", finish: "polished", diameter: 22, wf: 9.5, wr: 11, etf: 25, etr: 35, pcd: "5x112", bore: 66.6, seat: "cone60", construction: "forged_monoblock", usd: 135000, hubRings: true },
];

const WHEEL_COUNT = 24;
const SPOKES = [5, 6, 10, 7, 5, 12];

function wheelRecord(n: number): AdminProductRecord {
  const t = WHEELS[(n - 1) % WHEELS.length];
  const status: AdminProductStatus = n <= 17 ? "active" : n <= 21 ? "draft" : "archived";
  const preorder = n % 9 === 0;
  const imagesCount = status === "draft" ? n % 2 : 3;
  const title = n <= WHEELS.length ? t.title : `${t.title} · партия ${n}`;
  const images: AdminImage[] = Array.from({ length: imagesCount }, (_, i) => ({
    id: imageId(n, i), url: discImage(t.finish, SPOKES[(n - 1) % SPOKES.length] + i % 2), alt: `${t.title}, вид ${i + 1}`, sort_order: i,
  }));
  const detail: AdminProductDetail = {
    id: productId(n), type: "wheel_set", slug: `wheel-${String(n).padStart(2, "0")}-${t.finish}`,
    sku: `FCF-${String(n).padStart(3, "0")}-R${t.diameter}`, title, manufacturer: "ForgeCarbon Forged",
    description: "Комплект из 4 дисков. Фиксированная посадка, штатные размеры.", status,
    availability_mode: preorder ? "preorder" : "stock", stock_qty: preorder ? 0 : (n % 5) + 1,
    lead_time_min_days: preorder ? 21 : null, lead_time_max_days: preorder ? 35 : null,
    purchase_currency: "USD", purchase_cost: t.usd, pricing_mode: n % 7 === 0 ? "manual" : "auto",
    price: 0, price_atelier: n % 3 === 0 ? 11800000 : null, price_updated_at: FIXTURE_BASE_TIME,
    wheel: {
      diameter_in: t.diameter, width_front_in: t.wf, width_rear_in: t.wr, et_front_mm: t.etf, et_rear_mm: t.etr, pcd: t.pcd,
      center_bore_mm: t.bore, seat_type: t.seat, includes_hub_rings: t.hubRings ?? false, includes_fasteners: t.fasteners ?? false,
      construction: t.construction, finish: "Графит, сатин", weight_kg: 9.8,
    },
    warranty_months: 24, certifications: n === 1 ? ["TÜV"] : [], claims_verified: n === 1, compatible_vehicle_ids: [],
    reserved_qty: n % 5 === 1 ? 1 : 0, available_qty: 0, images, created_at: FIXTURE_BASE_TIME, updated_at: FIXTURE_BASE_TIME,
  };
  return { detail, in_orders: n === 2 };
}

const CARBON: Array<{ title: string; kind: CarbonKind; usd: number; cny?: boolean }> = [
  { title: "Диффузор карбоновый для BMW M4 G82", kind: "diffuser", usd: 90000 },
  { title: "Сплиттер карбоновый для BMW 5 Series G30", kind: "splitter", usd: 45000 },
  { title: "Спойлер карбоновый для Audi RS6 C8", kind: "spoiler", usd: 60000, cny: true },
  { title: "Накладки зеркал карбоновые для Mercedes-Benz E-Class W213", kind: "mirror", usd: 30000 },
  { title: "Диффузор карбоновый для Audi A6 C8", kind: "diffuser", usd: 85000 },
];

function carbonRecord(n: number): AdminProductRecord {
  const c = CARBON[n - 1];
  const id = 100 + n;
  const currency: PurchaseCurrency = c.cny ? "CNY" : "USD";
  const detail: AdminProductDetail = {
    id: productId(id), type: "carbon_part", slug: `carbon-${c.kind}-${n}`, sku: `FCC-${String(n).padStart(3, "0")}`,
    title: c.title, manufacturer: "ForgeCarbon Carbon", description: "Карбон под заказ, изготовление и доставка из Китая.",
    status: n === 5 ? "draft" : "active", availability_mode: "preorder", stock_qty: 0, lead_time_min_days: 21, lead_time_max_days: 35,
    purchase_currency: currency, purchase_cost: c.usd, pricing_mode: "auto", price: 0, price_atelier: null, price_updated_at: FIXTURE_BASE_TIME,
    wheel: null, warranty_months: 12, certifications: [], claims_verified: false,
    compatible_vehicle_ids: FIXTURE_VEHICLES.filter((v) => c.title.includes(`${v.generation}`)).map((v) => v.id),
    reserved_qty: 0, available_qty: 0, created_at: FIXTURE_BASE_TIME, updated_at: FIXTURE_BASE_TIME,
    images: n === 5 ? [] : [{ id: imageId(id, 0), url: carbonImage(c.kind), alt: c.title, sort_order: 0 }],
  };
  return { detail, in_orders: false };
}

export function fixtureProductRecords(): AdminProductRecord[] {
  return [
    ...Array.from({ length: WHEEL_COUNT }, (_, i) => wheelRecord(i + 1)),
    ...CARBON.map((_, i) => carbonRecord(i + 1)),
  ];
}
