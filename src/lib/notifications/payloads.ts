import { orderStatusLabel } from "@/lib/order-labels";
import type { CustomerStatusChangedPayload } from "@/lib/notifications/types";

// Сборка payload для customer_status_changed (5.9.2, US-004). Вызывается кодом, который меняет статус заказа (День 6, админка).

/** Ссылка отслеживания СДЭК (US-004). */
export const cdekTrackingUrl = (trackingNumber: string): string =>
  `https://www.cdek.ru/ru/tracking?order_id=${encodeURIComponent(trackingNumber)}`;

/** Трек и ссылка СДЭК попадают в payload только для статуса shipped (5.9.2). */
export function buildCustomerStatusChangedPayload(p: {
  orderNumber: string;
  status: string;
  trackingNumber: string | null;
  orderUrl: string | null;
}): CustomerStatusChangedPayload {
  const withTrack = p.status === "shipped" && p.trackingNumber !== null && p.trackingNumber !== "";
  return {
    order_number: p.orderNumber,
    status: p.status,
    status_label: orderStatusLabel(p.status),
    tracking_number: withTrack ? p.trackingNumber : null,
    tracking_url: withTrack && p.trackingNumber ? cdekTrackingUrl(p.trackingNumber) : null,
    order_url: p.orderUrl,
  };
}
