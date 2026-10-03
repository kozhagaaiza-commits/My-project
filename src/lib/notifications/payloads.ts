import { orderStatusLabel } from "@/lib/order-labels";
import { CDEK_TRACKING_URL } from "@/lib/orders/view";
import type { CustomerStatusChangedPayload } from "@/lib/notifications/types";

// Сборка payload для customer_status_changed (5.9.2, US-004). Вызывается кодом, который меняет статус заказа (День 6, админка).

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
    tracking_url: withTrack && p.trackingNumber ? `${CDEK_TRACKING_URL}${encodeURIComponent(p.trackingNumber)}` : null,
    order_url: p.orderUrl,
  };
}
