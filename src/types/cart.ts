// Контракт корзины (Чертёж, Блок 3 «POST /api/cart/validate», Блок 4 «Корзина», US-002/US-003).
// Деньги — целые копейки + *_formatted.
import type { AvailabilityMode, ProductType } from "@/types/catalog";

export type CartProblem = "out_of_stock" | "qty_reduced" | "unavailable" | "mixed_kind";
export type CartKind = "stock" | "preorder";

/** Хранится на клиенте: localStorage `fc_cart_v1`. price_seen — цена (копейки), которую видел покупатель. */
export interface StoredCart {
  kind: CartKind;
  items: Array<{ product_id: string; quantity: number; price_seen: number }>;
  updated_at: string; // ISO
}

export interface CartRequestItem { product_id: string; quantity: number }

export interface CartValidateItem {
  product_id: string;
  slug: string;
  title: string;
  cover_image_url: string | null;
  quantity: number;
  max_quantity: number;
  unit_price: number;
  unit_price_formatted: string;
  line_total: number;
  line_total_formatted: string;
  available: boolean;
  available_qty: number | null; // null для preorder
  problem: CartProblem | null;
}

/** Ответ POST /api/cart/validate → { data: CartValidation }. */
export interface CartValidation {
  kind: CartKind;
  items: CartValidateItem[];
  subtotal: number;
  subtotal_formatted: string;
  delivery_price: 0;
  total: number;
  total_formatted: string;
  can_checkout: boolean;
  price_tier: "retail" | "atelier";
}

/**
 * Данные товара, нужные для проверки корзины (ТОЛЬКО active-товары; draft/archived/несуществующие id
 * в результате отсутствуют → problem "unavailable"). unit_price уже с учётом уровня цены
 * (price_atelier для одобренного ателье при FEATURE_ATELIER, иначе price). Закупочные поля сюда не попадают.
 */
export interface CartProduct {
  id: string;
  slug: string;
  title: string;
  type: ProductType;
  availability_mode: AvailabilityMode;
  unit_price: number;
  available_qty: number | null; // stock: stock_qty − брони; preorder: null
  cover_image_url: string | null;
}
