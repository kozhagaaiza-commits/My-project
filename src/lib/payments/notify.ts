import { formatRub } from "@/lib/money";
import { DELIVERY_METHOD_LABELS } from "@/lib/order-labels";
import type { AdminAttentionPayload, CustomerOrderPaidPayload, CustomerRefundPayload, NotificationInput } from "@/lib/notifications/types";
import { customerChat, safeEnqueue } from "@/lib/notifications/safe-enqueue";
import type { OrderForPayment, OrderItemRow } from "@/lib/payments/db";
import type { PaymentsDeps } from "@/lib/payments/deps";

// Уведомления платёжного контура (5.9.2): постановка в очередь + запуск разбора (kick, День 5). Получатели: админ — Telegram
// (TELEGRAM_ADMIN_CHAT_ID), покупатель — email заказа и, если подписан в боте (orders.telegram_chat_id), Telegram.
// Ни одна функция не бросает: сбой уведомления не должен ломать обработку платежа; результат — true, если всё поставлено.
// После постановки вызывается deps.kick (отправка ПОСЛЕ ответа через after(), US-003: письмо ≤ 1 мин); очередь — запас.

type NotifyDeps = Pick<PaymentsDeps, "enqueue" | "siteUrl" | "adminChatId" | "orderUrl" | "customerChatId" | "kick">;


/** «Казань · СДЭК ПВЗ KZN45» (как в шаблоне admin_order_paid). */
export function deliveryLabel(o: Pick<OrderForPayment, "delivery_method" | "delivery_city" | "cdek_pvz_code">): string {
  if (o.delivery_method === "cdek_pvz") return `${o.delivery_city} · СДЭК ПВЗ ${o.cdek_pvz_code ?? ""}`.trim();
  if (o.delivery_method === "cdek_door") return `${o.delivery_city} · СДЭК до двери`;
  return `${o.delivery_city} · Курьер по Москве`;
}

export const vehicleShortLabel = (v: OrderForPayment["vehicle"]) => (v ? `${v.make} ${v.model} ${v.generation}` : null);

export const adminOrderUrl = (siteUrl: string, orderId: string) => `${siteUrl.replace(/\/$/, "")}/admin/orders/${orderId}`;

/** mark_order_paid → paid / paid_needs_attention: admin_order_paid + customer_order_paid (+ admin_attention). */
export function notifyOrderPaid(
  deps: NotifyDeps, order: OrderForPayment, items: OrderItemRow[], attentionReason: string | null,
): Promise<boolean> {
  return safeEnqueue(deps, async () => {
    const chatId = await customerChat(deps, order.number);
    const adminUrl = adminOrderUrl(deps.siteUrl, order.id);
    const totalFormatted = formatRub(order.total);
    const customerPaid: CustomerOrderPaidPayload = {
      order_number: order.number, kind: order.kind, total: order.total, total_formatted: totalFormatted,
      items: items.map((i) => ({
        title: i.title_snapshot, quantity: i.quantity,
        line_total: i.unit_price * i.quantity, line_total_formatted: formatRub(i.unit_price * i.quantity),
      })),
      delivery_method_label: DELIVERY_METHOD_LABELS[order.delivery_method], delivery_label: deliveryLabel(order),
      order_url: deps.orderUrl(order.number, order.client_request_id),
    };
    const list: NotificationInput[] = [
      {
        channel: "telegram", recipient: deps.adminChatId, template: "admin_order_paid",
        payload: {
          order_id: order.id, order_number: order.number, total: order.total, total_formatted: totalFormatted,
          items: items.map((i) => ({ title: i.title_snapshot, quantity: i.quantity })),
          vehicle_label: vehicleShortLabel(order.vehicle), vin: order.vin, delivery_label: deliveryLabel(order),
          admin_url: adminUrl, needs_attention: attentionReason !== null,
        },
      },
      { channel: "email", recipient: order.customer_email, template: "customer_order_paid", payload: customerPaid },
    ];
    if (chatId !== null) {
      list.push({ channel: "telegram", recipient: chatId, template: "customer_order_paid", payload: customerPaid });
    }
    if (attentionReason !== null) {
      list.push({
        channel: "telegram", recipient: deps.adminChatId, template: "admin_attention",
        payload: { order_id: order.id, order_number: order.number, kind: "paid_needs_attention", reason: attentionReason, admin_url: adminUrl },
      });
    }
    return list;
  });
}

/** Edge Case 39: 4xx при создании платежа → «Ошибка создания платежа FC-26-000123: <description>». */
export function notifyPaymentCreateFailed(deps: NotifyDeps, order: Pick<OrderForPayment, "id" | "number">, description: string) {
  return safeEnqueue(deps, () => [{
    channel: "telegram", recipient: deps.adminChatId, template: "admin_attention",
    payload: {
      order_id: order.id, order_number: order.number, kind: "payment_create_failed", reason: description,
      admin_url: adminOrderUrl(deps.siteUrl, order.id),
    },
  }]);
}

/** admin_attention произвольного вида (Edge Case 36 — duplicate_payment; не-RUB платёж — payment_currency_mismatch). */
export function notifyAdminAttention(
  deps: NotifyDeps, order: Pick<OrderForPayment, "id" | "number">, kind: AdminAttentionPayload["kind"], reason: string,
) {
  return safeEnqueue(deps, () => [{
    channel: "telegram", recipient: deps.adminChatId, template: "admin_attention",
    payload: { order_id: order.id, order_number: order.number, kind, reason, admin_url: adminOrderUrl(deps.siteUrl, order.id) },
  }]);
}

/** customer_refund (email + Telegram, если покупатель подписан): «По заказу … оформлен возврат 133 700 ₽…». */
export function notifyCustomerRefund(
  deps: NotifyDeps, order: Pick<OrderForPayment, "number" | "customer_email" | "client_request_id">, amount: number,
) {
  return safeEnqueue(deps, async () => {
    const chatId = await customerChat(deps, order.number);
    const payload: CustomerRefundPayload = {
      order_number: order.number, amount, amount_formatted: formatRub(amount),
      order_url: deps.orderUrl(order.number, order.client_request_id),
    };
    const list: NotificationInput[] = [{ channel: "email", recipient: order.customer_email, template: "customer_refund", payload }];
    if (chatId !== null) list.push({ channel: "telegram", recipient: chatId, template: "customer_refund", payload });
    return list;
  });
}
