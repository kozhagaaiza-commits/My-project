// Контракт ответов /api/admin/products*, /api/admin/vehicles*, /api/admin/settings (Чертёж, Блок 3).
// Деньги — целые копейки (закупка — минимальные единицы валюты), *_formatted приходят готовыми.
import type { ProductUpsertBody, VehicleUpsertBody } from "@/lib/admin-products-ui/schemas";
import type { SeatType } from "@/types/catalog";

export type AdminProductType = "wheel_set" | "carbon_part";
export type AdminProductStatus = "draft" | "active" | "archived";
export type PurchaseCurrency = "USD" | "CNY" | "RUB";

export interface AdminListMeta {
  total: number;
  page: number;
  per_page: number;
}

export interface AdminProductRow {
  id: string;
  type: AdminProductType;
  sku: string;
  slug: string;
  cover_url: string | null;
  title: string;
  status: AdminProductStatus;
  availability_mode: "stock" | "preorder";
  stock_qty: number;
  reserved_qty: number;
  available_qty: number;
  purchase_currency: PurchaseCurrency;
  purchase_cost: number;
  purchase_cost_formatted: string;
  pricing_mode: "auto" | "manual";
  price: number;
  price_formatted: string;
  price_atelier: number | null;
  price_atelier_formatted: string | null;
  images_count: number;
  updated_at: string;
}

export interface AdminImage {
  id: string;
  url: string;
  alt: string;
  sort_order: number;
}

/** GET /api/admin/products/[id]: формат тела POST + служебные поля (price здесь всегда посчитана). */
export interface AdminProductDetail extends Omit<ProductUpsertBody, "price"> {
  id: string;
  price: number | null;
  price_updated_at: string | null;
  reserved_qty: number;
  available_qty: number;
  images: AdminImage[];
  created_at: string;
  updated_at: string;
}

export interface AdminVehicleRow extends VehicleUpsertBody {
  id: string;
  seat_type: SeatType;
  fitting_products_count: number;
}

export interface AdminRate {
  rate: number;
  date: string;
}

export interface AdminSettings {
  markup_multiplier: number;
  price_rounding_rub: number;
  auto_reprice: boolean;
  reprice_threshold: number;
  rates: Partial<Record<"USD" | "CNY", AdminRate>>;
  updated_at: string;
}

export interface SaveProductResult {
  id: string;
  slug?: string;
  status: AdminProductStatus;
  price?: number;
  updated_at?: string;
  price_calculation?: string;
}
