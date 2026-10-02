// Демо-данные каталога (только для CATALOG_FIXTURES=1). Автомобили — ровно как в supabase/seed.sql,
// id — детерминированные uuid-плейсхолдеры. Цены — целые копейки.
import type { Construction, SeatType } from "@/types/catalog";
import { carbonImage, discImage, type CarbonKind, type DiscFinish } from "./catalog-fixtures-images";

export interface FixtureVehicle {
  id: string;
  make: string;
  model: string;
  generation: string;
  year_from: number;
  year_to: number | null;
  pcd: string;
  center_bore_mm: number;
  seat_type: SeatType;
  fastener_spec: string;
  diameter_min_in: number;
  diameter_max_in: number;
  width_min_in: number;
  width_max_in: number;
  et_min_mm: number;
  et_max_mm: number;
}

type VehicleRow = [
  string, string, string, number, number | null, string, number, SeatType, string,
  number, number, number, number, number, number,
];

const vehicleRows: VehicleRow[] = [
  ["Audi", "A4", "B9", 2016, 2024, "5x112", 66.5, "ball_r13", "Болт M14×1.5", 17, 20, 7.5, 9.0, 25, 45],
  ["Audi", "A6", "C8", 2018, null, "5x112", 66.5, "ball_r13", "Болт M14×1.5", 18, 22, 8.0, 10.0, 20, 45],
  ["Audi", "RS6", "C8", 2019, null, "5x112", 66.5, "ball_r13", "Болт M14×1.5", 21, 23, 9.5, 11.0, 15, 35],
  ["Audi", "Q7", "4M", 2015, null, "5x112", 66.5, "ball_r13", "Болт M14×1.5", 19, 22, 8.5, 10.5, 20, 40],
  ["BMW", "3 Series", "F30", 2012, 2019, "5x120", 72.6, "cone60", "Болт M14×1.25", 17, 20, 7.5, 9.5, 20, 45],
  ["BMW", "3 Series", "G20", 2019, null, "5x112", 66.6, "cone60", "Болт M14×1.25", 18, 20, 7.5, 9.5, 20, 40],
  ["BMW", "5 Series", "F10", 2010, 2017, "5x120", 72.6, "cone60", "Болт M14×1.25", 17, 20, 8.0, 10.0, 15, 40],
  ["BMW", "5 Series", "G30", 2017, 2023, "5x112", 66.6, "cone60", "Болт M14×1.25", 18, 21, 8.0, 10.0, 20, 40],
  ["BMW", "M4", "G82", 2021, null, "5x112", 66.6, "cone60", "Болт M14×1.25", 19, 21, 9.0, 11.0, 15, 40],
  ["BMW", "X5", "G05", 2018, 2023, "5x112", 66.6, "cone60", "Болт M14×1.25", 19, 22, 9.0, 11.5, 20, 45],
  ["Mercedes-Benz", "C-Class", "W205", 2014, 2021, "5x112", 66.6, "ball_r14", "Болт M14×1.5", 17, 20, 7.5, 9.5, 25, 50],
  ["Mercedes-Benz", "E-Class", "W213", 2016, 2023, "5x112", 66.6, "ball_r14", "Болт M14×1.5", 18, 21, 8.0, 10.0, 25, 50],
  ["Mercedes-Benz", "GLE", "W167", 2019, null, "5x112", 66.6, "ball_r14", "Болт M14×1.5", 19, 22, 9.0, 10.5, 25, 50],
];

export const FIXTURE_VEHICLES: FixtureVehicle[] = vehicleRows.map((r, i) => ({
  id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  make: r[0], model: r[1], generation: r[2], year_from: r[3], year_to: r[4], pcd: r[5],
  center_bore_mm: r[6], seat_type: r[7], fastener_spec: r[8],
  diameter_min_in: r[9], diameter_max_in: r[10], width_min_in: r[11], width_max_in: r[12],
  et_min_mm: r[13], et_max_mm: r[14],
}));

const vehicleId = (generation: string): string => {
  const v = FIXTURE_VEHICLES.find((x) => x.generation === generation);
  if (!v) throw new Error(`Fixture vehicle not found: ${generation}`);
  return v.id;
};

export interface FixtureWheelSpecs {
  diameter_in: number;
  width_front_in: number;
  width_rear_in: number | null;
  et_front_mm: number;
  et_rear_mm: number | null;
  pcd: string;
  center_bore_mm: number;
  seat_type: SeatType;
  construction: Construction;
  finish: string;
  weight_kg: number;
  includes_hub_rings: boolean;
  includes_fasteners: boolean;
}

export interface FixtureProduct {
  id: string;
  type: "wheel_set" | "carbon_part";
  slug: string;
  sku: string;
  title: string;
  manufacturer: string;
  description: string;
  stock_qty: number;
  lead_time: { min_days: number; max_days: number } | null;
  price: number;
  price_atelier: number | null;
  warranty_months: number;
  created_at: string;
  wheel: FixtureWheelSpecs | null;
  compatible_vehicle_ids: string[] | null;
  images: Array<{ url: string; alt: string }>;
}

interface WheelInput {
  slug: string; sku: string; title: string; maker: "Forged" | "Cast"; stock: number; price: number; atelier: number | null;
  wheel: FixtureWheelSpecs; finish: DiscFinish; spokes: number; created: string; description: string;
}

const wheel = (
  d: number, wf: number, wr: number | null, ef: number, er: number | null, pcd: string, cb: number,
  seat: SeatType, construction: Construction, finish: string, kg: number, rings = false, fasteners = false,
): FixtureWheelSpecs => ({
  diameter_in: d, width_front_in: wf, width_rear_in: wr, et_front_mm: ef, et_rear_mm: er, pcd,
  center_bore_mm: cb, seat_type: seat, construction, finish, weight_kg: kg,
  includes_hub_rings: rings, includes_fasteners: fasteners,
});

const wheelInputs: WheelInput[] = [
  { slug: "forged-m01-r20-5x112-graphite", sku: "FCF-M01-2085-GR", title: "Кованый моноблок M-01 R20, 5×112, графит", maker: "Forged", stock: 3, price: 13370000, atelier: 11800000,
    wheel: wheel(20, 8.5, 9.5, 30, 40, "5x112", 66.6, "cone60", "forged_monoblock", "Графит, сатин", 9.8), finish: "graphite", spokes: 5, created: "2026-09-20T09:00:00Z",
    description: "Кованый моноблок из алюминиевого сплава 6061-T6. Комплект из 4 дисков: передние 8.5J ET30, задние 9.5J ET40." },
  { slug: "cast-c07-r19-5x112-silver", sku: "FCC-C07-1985-SL", title: "Литой диск C-07 R19, 5×112, серебро", maker: "Cast", stock: 0, price: 5240000, atelier: null,
    wheel: wheel(19, 8.5, null, 35, null, "5x112", 66.6, "cone60", "cast", "Серебро", 9.2), finish: "silver", spokes: 10, created: "2026-09-18T09:00:00Z",
    description: "Литой диск, комплект из 4 штук. Покрытие — серебро." },
  { slug: "forged-m01-r22-5x112-gloss-black", sku: "FCF-M01-2210-BK", title: "Кованый моноблок M-01 R22, 5×112, глянцевый чёрный", maker: "Forged", stock: 1, price: 21890000, atelier: 19200000,
    wheel: wheel(22, 10.5, 11, 25, 28, "5x112", 66.5, "ball_r13", "forged_monoblock", "Чёрный, глянец", 11.4), finish: "black", spokes: 5, created: "2026-09-25T09:00:00Z",
    description: "Кованый моноблок под Audi RS6 C8: передние 10.5J ET25, задние 11J ET28. Посадка — сфера R13." },
  { slug: "forged-2pc-r21-5x112-bronze", sku: "FCF-2PC-2190-BZ", title: "Кованый составной 2PC R21, 5×112, бронза", maker: "Forged", stock: 4, price: 18640000, atelier: 16300000,
    wheel: wheel(21, 9, 10, 28, 38, "5x112", 72.6, "cone60", "forged_2pc", "Бронза, сатин", 10.6, true, true), finish: "bronze", spokes: 10, created: "2026-09-12T09:00:00Z",
    description: "Двухсоставной кованый диск. В комплекте центровочные кольца и крепёж." },
  { slug: "forged-3pc-r20-5x120-satin", sku: "FCF-3PC-2085-SN", title: "Кованый составной 3PC R20, 5×120, сатин", maker: "Forged", stock: 2, price: 24510000, atelier: null,
    wheel: wheel(20, 8.5, 9.5, 30, 40, "5x120", 72.6, "cone60", "forged_3pc", "Сатин", 10.1), finish: "gunmetal", spokes: 6, created: "2026-08-30T09:00:00Z",
    description: "Трёхсоставной кованый диск под BMW с разболтовкой 5×120." },
  { slug: "cast-r18-5x120-gunmetal", sku: "FCC-R18-1880-GM", title: "Литой диск R18, 5×120, тёмный металлик", maker: "Cast", stock: 4, price: 4180000, atelier: 3700000,
    wheel: wheel(18, 8, null, 34, null, "5x120", 72.6, "cone60", "cast", "Тёмный металлик", 8.9), finish: "gunmetal", spokes: 5, created: "2026-08-15T09:00:00Z",
    description: "Литой диск, комплект из 4 штук, штатная посадка BMW." },
  { slug: "flow-r19-5x112-hyper-silver", sku: "FCW-R19-1985-HS", title: "Flow-formed диск R19, 5×112, hyper silver", maker: "Cast", stock: 2, price: 7120000, atelier: null,
    wheel: wheel(19, 8.5, 9.5, 32, 38, "5x112", 66.6, "cone60", "flow_formed", "Hyper silver", 8.6), finish: "silver", spokes: 6, created: "2026-09-05T09:00:00Z",
    description: "Flow-formed: облегчённая бочка, комплект из 4 дисков." },
  { slug: "cast-r19-5x112-merc-black", sku: "FCC-R19-1985-MB", title: "Литой диск R19, 5×112, чёрный, под Mercedes-Benz", maker: "Cast", stock: 3, price: 5890000, atelier: null,
    wheel: wheel(19, 8.5, null, 38, null, "5x112", 66.6, "ball_r14", "cast", "Чёрный, мат", 9.0), finish: "black", spokes: 5, created: "2026-09-08T09:00:00Z",
    description: "Литой диск с посадкой сфера R14 для Mercedes-Benz." },
  { slug: "forged-m02-r21-5x112-polished", sku: "FCF-M02-2195-PL", title: "Кованый моноблок M-02 R21, 5×112, полировка", maker: "Forged", stock: 0, price: 15890000, atelier: 14100000,
    wheel: wheel(21, 9.5, null, 30, null, "5x112", 66.6, "cone60", "forged_monoblock", "Полировка", 10.2), finish: "polished", spokes: 6, created: "2026-08-22T09:00:00Z",
    description: "Кованый моноблок, полированная лицевая часть. Комплект из 4 дисков." },
  { slug: "cast-r17-5x112-audi-silver", sku: "FCC-R17-1775-AS", title: "Литой диск R17, 5×112, серебро, под Audi", maker: "Cast", stock: 4, price: 3290000, atelier: null,
    wheel: wheel(17, 7.5, null, 38, null, "5x112", 66.5, "ball_r13", "cast", "Серебро", 8.4), finish: "silver", spokes: 10, created: "2026-07-30T09:00:00Z",
    description: "Литой диск с посадкой сфера R13 для Audi." },
  { slug: "forged-rs-r23-5x112-black", sku: "FCF-RS-2310-BK", title: "Кованый моноблок RS R23, 5×112, чёрный", maker: "Forged", stock: 1, price: 27940000, atelier: 24500000,
    wheel: wheel(23, 10.5, 11, 22, 25, "5x112", 66.5, "ball_r13", "forged_monoblock", "Чёрный, сатин", 12.0), finish: "black", spokes: 6, created: "2026-09-27T09:00:00Z",
    description: "Кованый моноблок R23 для Audi RS6 C8." },
];

interface CarbonInput {
  slug: string; sku: string; title: string; price: number; atelier: number | null; lead: [number, number];
  kind: CarbonKind; vehicles: string[]; created: string; description: string; alt: string; warranty: number;
}

const carbonInputs: CarbonInput[] = [
  { slug: "bmw-m4-g82-carbon-rear-diffuser", sku: "FCC-G82-DIF-01", title: "Задний диффузор, карбон, BMW M4 G82/G83", price: 9860000, atelier: 8700000, lead: [21, 35],
    kind: "diffuser", vehicles: [vehicleId("G82")], created: "2026-09-26T09:00:00Z", alt: "Карбоновый диффузор BMW M4 G82", warranty: 12,
    description: "Диффузор из препрега, лак с УФ-защитой, крепление в штатные точки." },
  { slug: "bmw-m4-g82-carbon-front-splitter", sku: "FCC-G82-SPL-01", title: "Передний сплиттер, карбон, BMW M4 G82", price: 7420000, atelier: null, lead: [21, 35],
    kind: "splitter", vehicles: [vehicleId("G82")], created: "2026-09-14T09:00:00Z", alt: "Карбоновый сплиттер BMW M4 G82", warranty: 12,
    description: "Сплиттер из препрега, лак с УФ-защитой." },
  { slug: "bmw-g20-g30-carbon-trunk-spoiler", sku: "FCC-BMW-SPO-02", title: "Спойлер на крышку багажника, карбон, BMW 3 Series G20 / 5 Series G30", price: 4890000, atelier: 4300000, lead: [21, 45],
    kind: "spoiler", vehicles: [vehicleId("G20"), vehicleId("G30")], created: "2026-09-02T09:00:00Z", alt: "Карбоновый спойлер BMW", warranty: 12,
    description: "Спойлер-утиный хвост, крепление на штатный клей." },
  { slug: "audi-rs6-c8-carbon-mirror-caps", sku: "FCC-RS6-MIR-01", title: "Накладки на зеркала, карбон, Audi RS6 C8", price: 3640000, atelier: null, lead: [21, 35],
    kind: "mirror", vehicles: [vehicleId("C8")], created: "2026-08-25T09:00:00Z", alt: "Карбоновые накладки на зеркала Audi RS6", warranty: 12,
    description: "Накладки на корпуса зеркал, установка поверх штатных." },
  { slug: "mercedes-c-class-w205-carbon-spoiler", sku: "FCC-W205-SPO-01", title: "Спойлер, карбон, Mercedes-Benz C-Class W205 / E-Class W213", price: 5260000, atelier: 4650000, lead: [21, 45],
    kind: "spoiler", vehicles: [vehicleId("W205"), vehicleId("W213")], created: "2026-08-10T09:00:00Z", alt: "Карбоновый спойлер Mercedes-Benz", warranty: 12,
    description: "Спойлер из препрега, лак с УФ-защитой." },
];

const MAKER_NAMES = { Forged: "ForgeCarbon Forged", Cast: "ForgeCarbon Cast" } as const;

const wheelProducts: FixtureProduct[] = wheelInputs.map((w, i) => ({
  id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  type: "wheel_set", slug: w.slug, sku: w.sku, title: w.title, manufacturer: MAKER_NAMES[w.maker],
  description: w.description, stock_qty: w.stock, lead_time: null, price: w.price, price_atelier: w.atelier,
  warranty_months: 24, created_at: w.created, wheel: w.wheel, compatible_vehicle_ids: null,
  images: [{ url: discImage(w.finish, w.spokes), alt: `${w.title}, вид спереди` }],
}));

const carbonProducts: FixtureProduct[] = carbonInputs.map((c, i) => ({
  id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  type: "carbon_part", slug: c.slug, sku: c.sku, title: c.title, manufacturer: "ForgeCarbon Carbon",
  description: c.description, stock_qty: 0, lead_time: { min_days: c.lead[0], max_days: c.lead[1] },
  price: c.price, price_atelier: c.atelier, warranty_months: c.warranty, created_at: c.created, wheel: null,
  compatible_vehicle_ids: c.vehicles, images: [{ url: carbonImage(c.kind), alt: c.alt }],
}));

export const FIXTURE_PRODUCTS: FixtureProduct[] = [...wheelProducts, ...carbonProducts];
