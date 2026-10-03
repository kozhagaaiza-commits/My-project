// Значения формы товара. Все числа — строки (поля ввода); в тело productUpsertBody их приводит buildProductBody.
// Имена полей совпадают с путями схемы (wheel.diameter_in …), поэтому ошибки zod и details.fields сервера
// ложатся на поля без таблицы соответствий.
import { formatDecimal } from "@/lib/catalog";
import { PCD_PRESETS } from "@/lib/admin-products-ui/labels";
import { kopecksToPriceInput, minorToInput } from "@/lib/admin-products-ui/money-input";
import type { AdminProductDetail, AdminProductType, PurchaseCurrency } from "@/lib/admin-products-ui/types";
import type { Construction, SeatType } from "@/types/catalog";

export type Certification = "TÜV" | "JWL" | "VIA" | "KBA";

export interface WheelFormValues {
  diameter_in: string;
  width_front_in: string;
  width_rear_in: string;
  et_front_mm: string;
  et_rear_mm: string;
  pcd: string;
  /** true — PCD выбран как «Другое» и вводится вручную. */
  pcd_other: boolean;
  center_bore_mm: string;
  seat_type: SeatType | "";
  includes_hub_rings: boolean;
  includes_fasteners: boolean;
  construction: Construction | "";
  finish: string;
  weight_kg: string;
}

export interface ProductFormValues {
  type: AdminProductType;
  title: string;
  manufacturer: string;
  sku: string;
  slug: string;
  description: string;
  availability_mode: "stock" | "preorder";
  stock_qty: string;
  lead_time_min_days: string;
  lead_time_max_days: string;
  purchase_currency: PurchaseCurrency;
  /** В единицах валюты: «800.00». */
  purchase_cost: string;
  pricing_mode: "auto" | "manual";
  /** Рубли: «133700». */
  price: string;
  price_atelier: string;
  wheel: WheelFormValues;
  warranty_months: string;
  certifications: Certification[];
  claims_verified: boolean;
  compatible_vehicle_ids: string[];
}

export const EMPTY_WHEEL: WheelFormValues = {
  diameter_in: "", width_front_in: "", width_rear_in: "", et_front_mm: "", et_rear_mm: "",
  pcd: "", pcd_other: false, center_bore_mm: "", seat_type: "", includes_hub_rings: false,
  includes_fasteners: false, construction: "", finish: "", weight_kg: "",
};

/** Новая форма: warranty_months = 12, purchase_currency = USD, pricing_mode = auto (Блок 4, «Empty»). */
export const EMPTY_PRODUCT_VALUES: ProductFormValues = {
  type: "wheel_set", title: "", manufacturer: "", sku: "", slug: "", description: "",
  availability_mode: "stock", stock_qty: "0", lead_time_min_days: "", lead_time_max_days: "",
  purchase_currency: "USD", purchase_cost: "", pricing_mode: "auto", price: "", price_atelier: "",
  wheel: EMPTY_WHEEL, warranty_months: "12", certifications: [], claims_verified: false,
  compatible_vehicle_ids: [],
};

const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : formatDecimal(n));

export function valuesFromDetail(d: AdminProductDetail): ProductFormValues {
  const w = d.wheel;
  const isPreset = w ? (PCD_PRESETS as readonly string[]).includes(w.pcd) : true;
  return {
    type: d.type,
    title: d.title,
    manufacturer: d.manufacturer,
    sku: d.sku,
    slug: d.slug,
    description: d.description,
    availability_mode: d.availability_mode,
    stock_qty: String(d.stock_qty),
    lead_time_min_days: str(d.lead_time_min_days),
    lead_time_max_days: str(d.lead_time_max_days),
    purchase_currency: d.purchase_currency,
    purchase_cost: minorToInput(d.purchase_cost),
    pricing_mode: d.pricing_mode,
    price: d.pricing_mode === "manual" ? kopecksToPriceInput(d.price) : "",
    price_atelier: kopecksToPriceInput(d.price_atelier),
    wheel: w
      ? {
          diameter_in: String(w.diameter_in), width_front_in: str(w.width_front_in), width_rear_in: str(w.width_rear_in),
          et_front_mm: String(w.et_front_mm), et_rear_mm: str(w.et_rear_mm), pcd: w.pcd, pcd_other: !isPreset,
          center_bore_mm: str(w.center_bore_mm), seat_type: w.seat_type,
          includes_hub_rings: w.includes_hub_rings, includes_fasteners: w.includes_fasteners,
          construction: w.construction, finish: w.finish ?? "", weight_kg: str(w.weight_kg),
        }
      : EMPTY_WHEEL,
    warranty_months: String(d.warranty_months),
    certifications: d.certifications,
    claims_verified: d.claims_verified,
    compatible_vehicle_ids: d.compatible_vehicle_ids,
  };
}
