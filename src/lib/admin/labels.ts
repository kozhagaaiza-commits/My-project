import { vehicleLabel } from "@/lib/catalog";
import type { DeliveryMethod } from "@/types/order-view";

// Подписи для списков и карточки заказа в админке (Блок 3: GET /api/admin/orders{,/[id]}). Чистые функции.

/** Короткие подписи способа доставки для строки списка («СДЭК ПВЗ · Казань · KZN45»). */
const DELIVERY_SHORT: Record<DeliveryMethod, string> = {
  cdek_pvz: "СДЭК ПВЗ",
  cdek_door: "СДЭК до двери",
  moscow_courier: "Курьер по Москве",
};

/**
 * Пример Блока 3: «СДЭК ПВЗ · Казань · KZN45». Для остальных способов — та же схема «способ · город»
 * (кода ПВЗ у них нет; адрес в список не выводится — он в карточке заказа).
 */
export function adminDeliveryLabel(o: { delivery_method: DeliveryMethod; delivery_city: string; cdek_pvz_code: string | null }): string {
  const parts = [DELIVERY_SHORT[o.delivery_method], o.delivery_city];
  if (o.delivery_method === "cdek_pvz" && o.cdek_pvz_code) parts.push(o.cdek_pvz_code);
  return parts.join(" · ");
}

export interface VehicleEmbed {
  make: string;
  model: string;
  generation: string;
  year_from: number;
  year_to: number | null;
}

/** «BMW 5 Series G30 · 2017–2023» (как в каталоге); авто не указано или удалено из справочника → null. */
export const adminVehicleLabel = (v: VehicleEmbed | null): string | null => (v === null ? null : vehicleLabel(v));
