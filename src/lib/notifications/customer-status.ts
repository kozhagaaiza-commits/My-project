import "server-only";
import { buildCustomerStatusChangedPayload } from "@/lib/notifications/payloads";
import { customerChat, safeEnqueue, type QueueDeps } from "@/lib/notifications/safe-enqueue";
import type { NotificationInput } from "@/lib/notifications/types";

// customer_status_changed (5.9.2, US-004): покупателю — email и, если он подписан в боте, Telegram.
// Для админки (День 6; delivery — изменение срока/заметки, A47): вызывать после успешной смены статуса; не бросает; после постановки запускает разбор очереди.

export function notifyCustomerStatusChanged(
  deps: QueueDeps,
  p: { orderNumber: string; customerEmail: string; status: string; trackingNumber: string | null; orderUrl: string | null;
    delivery?: { expectedReadyAt: string | null; customerVisibleNote: string | null } },
): Promise<boolean> {
  return safeEnqueue(deps, async () => {
    const chatId = await customerChat(deps, p.orderNumber);
    const payload = buildCustomerStatusChangedPayload(p);
    const list: NotificationInput[] = [{ channel: "email", recipient: p.customerEmail, template: "customer_status_changed", payload }];
    if (chatId !== null) list.push({ channel: "telegram", recipient: chatId, template: "customer_status_changed", payload });
    return list;
  });
}

/**
 * Изменение срока поставки / видимой покупателю заметки (Edge Case 21, A47): шаблон customer_status_changed с текущим
 * статусом заказа и новыми срок/заметка. Не бросает; true — поставлено в очередь (customer_notified).
 */
export function notifyDeliveryChanged(
  deps: QueueDeps,
  p: {
    orderNumber: string; customerEmail: string; status: string; trackingNumber: string | null; orderUrl: string | null;
    expectedReadyAt: string | null; customerVisibleNote: string | null;
  },
): Promise<boolean> {
  return notifyCustomerStatusChanged(deps, {
    orderNumber: p.orderNumber, customerEmail: p.customerEmail, status: p.status, trackingNumber: p.trackingNumber,
    orderUrl: p.orderUrl, delivery: { expectedReadyAt: p.expectedReadyAt, customerVisibleNote: p.customerVisibleNote },
  });
}
