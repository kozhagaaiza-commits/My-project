import { formatRub } from "@/lib/money";
import { minorToInput } from "@/lib/admin-products-ui/money-input";
import type { AdminProductDetail, AdminProductRow, PurchaseCurrency } from "@/lib/admin-products-ui/types";

export interface FixtureResponse {
  status: number;
  body: unknown;
}

export const ok = (data: unknown, status = 200, meta?: unknown): FixtureResponse => ({
  status,
  body: meta === undefined ? { data } : { data, meta },
});

export const fail = (status: number, code: string, message: string, details?: unknown): FixtureResponse => ({
  status,
  body: { error: { code, message, ...(details ? { details } : {}) } },
});

export const notFound = (message: string) => fail(404, "NOT_FOUND", message);

const SYMBOL: Record<PurchaseCurrency, string> = { USD: "$", CNY: "¥", RUB: "" };

/** «$800.00», «¥500.00», «50 000 ₽». */
export function formatPurchase(minor: number, currency: PurchaseCurrency): string {
  return currency === "RUB" ? formatRub(minor) : `${SYMBOL[currency]}${minorToInput(minor)}`;
}

export function toRow(d: AdminProductDetail): AdminProductRow {
  return {
    id: d.id, type: d.type, sku: d.sku, slug: d.slug, cover_url: d.images[0]?.url ?? null, title: d.title, status: d.status,
    availability_mode: d.availability_mode, stock_qty: d.stock_qty, reserved_qty: d.reserved_qty, available_qty: d.available_qty,
    purchase_currency: d.purchase_currency, purchase_cost: d.purchase_cost, purchase_cost_formatted: formatPurchase(d.purchase_cost, d.purchase_currency),
    pricing_mode: d.pricing_mode, price: d.price ?? 0, price_formatted: formatRub(d.price ?? 0),
    price_atelier: d.price_atelier, price_atelier_formatted: d.price_atelier === null ? null : formatRub(d.price_atelier),
    images_count: d.images.length, updated_at: d.updated_at,
  };
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
