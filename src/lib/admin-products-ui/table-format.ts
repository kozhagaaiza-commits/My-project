import type { AdminProductRow } from "@/lib/admin-products-ui/types";

/** Наличие в таблице: «3 из 4» (available из stock) или «Под заказ». */
export const availabilityText = (p: Pick<AdminProductRow, "availability_mode" | "available_qty" | "stock_qty">): string =>
  p.availability_mode === "preorder" ? "Под заказ" : `${p.available_qty} из ${p.stock_qty}`;

/** Название для подтверждения удаления: «Кованый моноблок M-01…». */
export function shortTitle(title: string, max = 21): string {
  const t = title.trim();
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}…`;
}
