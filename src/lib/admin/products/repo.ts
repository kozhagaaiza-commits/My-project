import type {
  AdminImageRow, AdminListRow, AdminProductRow, AutoPriceRow, PricingSettings, ProductStatusRow, ProductWriteRow, RateRow,
} from "./rows";

// Контракт доступа к данным админки товаров. Реальная реализация — ./db.ts (сессионный клиент Supabase,
// RLS is_admin(); service-role — только RPC reserved_qty_map, она выдана только service_role, 2.19).
// В тестах — in-memory подмена (./fake-repo.ts). Ошибки БД — DbError с кодом Postgres (23505, P0001 …).

export interface ProductListFilter {
  type?: "wheel_set" | "carbon_part";
  status?: "draft" | "active" | "archived";
  q?: string;
  page: number;
  perPage: number;
}

/** Колонки products, которые пишет админка (Блок 2.4). */
export interface ProductColumns {
  type: "wheel_set" | "carbon_part";
  slug: string;
  sku: string;
  title: string;
  manufacturer: string;
  description: string;
  status: "draft" | "active" | "archived";
  availability_mode: "stock" | "preorder";
  stock_qty: number;
  lead_time_min_days: number | null;
  lead_time_max_days: number | null;
  purchase_currency: "USD" | "CNY" | "RUB";
  purchase_cost: number;
  pricing_mode: "auto" | "manual";
  price: number;
  price_atelier: number | null;
  price_updated_at: string;
  diameter_in: number | null;
  width_front_in: number | null;
  width_rear_in: number | null;
  et_front_mm: number | null;
  et_rear_mm: number | null;
  pcd: string | null;
  center_bore_mm: number | null;
  seat_type: "cone60" | "ball_r13" | "ball_r14" | "flat" | null;
  includes_hub_rings: boolean;
  includes_fasteners: boolean;
  construction: "cast" | "flow_formed" | "forged_monoblock" | "forged_2pc" | "forged_3pc" | null;
  finish: string | null;
  weight_kg: number | null;
  warranty_months: number;
  certifications: string[];
  claims_verified: boolean;
}

export interface NewImage {
  product_id: string;
  storage_path: string;
  alt: string;
  sort_order: number;
}

export interface AdminProductsRepo {
  listProducts(filter: ProductListFilter): Promise<{ rows: AdminListRow[]; total: number }>;
  /** Фото товаров (для списка — по странице id; для карточки — один id), по sort_order. */
  listImages(productIds: string[]): Promise<AdminImageRow[]>;
  /** Брони pending_payment с reserved_until > now() (RPC reserved_qty_map, service-role). */
  reservedQty(): Promise<Map<string, number>>;
  getProduct(id: string): Promise<AdminProductRow | null>;
  getProductStatus(id: string): Promise<ProductStatusRow | null>;
  productVehicleIds(productId: string): Promise<string[]>;
  /** Какие из ids есть в vehicles (admin видит и скрытые). */
  existingVehicleIds(ids: string[]): Promise<string[]>;
  /** Полная замена product_vehicles: сначала добавление недостающих, затем удаление лишних. */
  replaceProductVehicles(productId: string, vehicleIds: string[]): Promise<void>;
  /** Занятые slug вида `<base>` и `<base>-*` (для suggestion). */
  takenSlugs(base: string): Promise<string[]>;
  insertProduct(row: ProductColumns): Promise<ProductWriteRow>;
  /** update … where id = $1 and updated_at = $2; 0 строк → null. */
  updateProduct(id: string, updatedAt: string, patch: Partial<ProductColumns>): Promise<ProductWriteRow | null>;
  /** delete … where id; false — строки уже нет. */
  deleteProduct(id: string): Promise<boolean>;
  hasOrderItems(productId: string): Promise<boolean>;
  latestRate(currency: "USD" | "CNY"): Promise<RateRow | null>;
  /** Последний курс валюты с rate_date ≤ date (YYYY-MM-DD) — курс, по которому считалась цена (5.4, автопересчёт). */
  rateOnOrBefore(currency: "USD" | "CNY", date: string): Promise<RateRow | null>;
  pricingSettings(): Promise<PricingSettings>;
  insertImage(row: NewImage): Promise<AdminImageRow>;
  /** false — фото с таким id у товара нет. */
  updateImage(productId: string, imageId: string, patch: { sort_order: number; alt: string }): Promise<boolean>;
  deleteImage(productId: string, imageId: string): Promise<boolean>;
  listAutoPriced(): Promise<AutoPriceRow[]>;
  /** update price, price_updated_at where id and pricing_mode = 'auto' and price = old; false — запись изменилась. */
  updateAutoPrice(id: string, oldPrice: number, newPrice: number, at: string): Promise<boolean>;
  /**
   * Цена по новому курсу не изменилась: update price_updated_at where id in ids and pricing_mode = 'auto' — цена
   * считается актуальной на этот курс, и автопересчёт не срабатывает на неё повторно каждый день. Число обновлённых строк.
   */
  touchAutoPrices(ids: string[], at: string): Promise<number>;
}

/** Storage бакета product-images через сессионный клиент (политики 2.15 — только admin). */
export interface ImageStorage {
  upload(path: string, body: Blob, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
  /** Полные пути объектов в папке `products/<id>`. */
  list(prefix: string): Promise<string[]>;
}
