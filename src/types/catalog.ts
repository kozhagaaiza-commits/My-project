// Контракт публичного каталога (Чертёж, Блок 3: «Подбор по авто», «Каталог»).
// Типы совпадают с JSON-примерами ответов. Деньги — целые копейки + *_formatted.

export type ProductType = "wheel_set" | "carbon_part";
export type AvailabilityMode = "stock" | "preorder";
export type AvailabilityStatus = "in_stock" | "out_of_stock" | "preorder";
export type SeatType = "cone60" | "ball_r13" | "ball_r14" | "flat";
export type Construction = "cast" | "flow_formed" | "forged_monoblock" | "forged_2pc" | "forged_3pc";

export interface VehicleOption {
  id: string;
  make: string;
  model: string;
  generation: string;
  year_from: number;
  year_to: number | null;
  label: string; // «BMW 5 Series G30 · 2017–2023»
}

export interface VehicleDetail extends VehicleOption {
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

export interface Availability {
  mode: AvailabilityMode;
  available_qty: number | null;
  status: AvailabilityStatus;
  label: string;
  delivery_text: string | null;
  // Карточка: всегда (null для stock). Список: только для preorder (дополнение к JSON Чертежа — UI «Под заказ · 21–35 дней»).
  lead_time?: { min_days: number; max_days: number } | null;
}

export interface ListFitment {
  vehicle_id: string;
  fits: boolean;
  needs_hub_rings: boolean;
}

export interface DetailFitment extends ListFitment {
  vehicle_label: string;
  fastener_note: string | null;
}

export interface ProductImage {
  url: string;
  alt: string;
}

export interface ProductListItem {
  id: string;
  type: ProductType;
  slug: string;
  title: string;
  manufacturer: string;
  price: number;
  price_formatted: string;
  price_atelier: number | null;
  price_atelier_formatted: string | null;
  availability: Availability;
  specs_short: string | null; // «R20 · 8.5J/9.5J · 5×112 · ET 30/40 · ЦО 66.6»; для карбона null
  fitment: ListFitment | null; // null, если vehicle не передан
  cover_image: ProductImage | null;
}

export interface ProductListMeta {
  total: number;
  page: number;
  per_page: number;
  vehicle_label: string | null;
}

export interface ProductSpecs {
  diameter_in: number;
  width_front_in: number;
  width_rear_in: number | null;
  et_front_mm: number;
  et_rear_mm: number | null;
  pcd: string;
  center_bore_mm: number;
  seat_type: SeatType;
  seat_type_label: string; // «Конус 60°»
  construction: Construction;
  construction_label: string; // «Кованый моноблок»
  finish: string | null;
  weight_kg: number | null;
  includes_hub_rings: boolean;
  includes_fasteners: boolean;
}

export interface ProductDetail {
  id: string;
  type: ProductType;
  slug: string;
  sku: string;
  title: string;
  manufacturer: string;
  description: string;
  price: number;
  price_formatted: string;
  price_atelier: number | null;
  price_atelier_formatted: string | null;
  sold_as: string; // «Комплект из 4 дисков» / «1 шт.»
  availability: Availability;
  specs: ProductSpecs | null; // null для карбона
  warranty_months: number;
  certifications: string[]; // [] если claims_verified = false
  images: Array<ProductImage & { sort_order: number }>;
  fitment: DetailFitment | null;
  compatible_vehicles: string[] | null; // для карбона; для дисков null
  status?: "draft" | "active" | "archived"; // только для admin (draft/archived карточки видны админу)
}

/** Параметры GET /api/products (Zod-схема productsQuery — в src/lib/schemas/catalog.ts). */
export interface ProductsQuery {
  type: ProductType;
  vehicle?: string;
  diameter?: number;
  construction?: "cast" | "flow_formed" | "forged";
  availability: "in_stock" | "all";
  sort: "price_asc" | "price_desc" | "newest";
  page: number;
}

/** Кто смотрит каталог: определяет, показывать ли price_atelier (BR-10). */
export interface CatalogContext {
  atelierId: string | null;
  /** Сессия role = admin: карточка доступна для draft/archived (с полем status). */
  isAdmin?: boolean;
}

export type ListProductsResult =
  | { kind: "ok"; data: ProductListItem[]; meta: ProductListMeta }
  | { kind: "vehicle_not_found" };

export type ProductDetailResult =
  | { kind: "ok"; data: ProductDetail }
  | { kind: "not_found" }
  | { kind: "vehicle_not_found" };
