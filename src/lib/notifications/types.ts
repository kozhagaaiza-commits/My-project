// Шаблоны и payload уведомлений (Чертёж 2.13 notification_queue, 5.9.2 «Тексты сообщений»).
// payload — данные для рендера, а не готовый текст: тексты и escapeHtml делает отправщик (День 5, templates.ts).
// Суммы — копейки + *_formatted (formatRub), ссылки — абсолютные.

export const NOTIFICATION_TEMPLATES = [
  "admin_order_paid", "admin_atelier_applied", "admin_attention",
  "customer_order_paid", "customer_status_changed", "customer_refund",
  "atelier_approved", "atelier_rejected",
] as const;
export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];
export type NotificationChannel = "telegram" | "email";

export interface NotificationItem {
  title: string;
  quantity: number;
}

/** 💳 Оплачен заказ FC-26-000123 · 133 700 ₽ / состав / авто · VIN / доставка / ссылка в админку. */
export interface AdminOrderPaidPayload {
  order_id: string;
  order_number: string;
  total: number;
  total_formatted: string;
  items: NotificationItem[];
  vehicle_label: string | null; // «BMW 5 Series G30»
  vin: string | null;
  delivery_label: string; // «Казань · СДЭК ПВЗ KZN45»
  admin_url: string; // `${SITE}/admin/orders/<id>`
  needs_attention: boolean;
}

/** Письмо «Заказ FC-26-000123 оплачен»: состав, сумма, способ доставки, ссылка «Статус заказа». */
export interface CustomerOrderPaidPayload {
  order_number: string;
  kind: "stock" | "preorder";
  total: number;
  total_formatted: string;
  items: Array<NotificationItem & { line_total: number; line_total_formatted: string }>;
  delivery_method_label: string; // «СДЭК — пункт выдачи»
  delivery_label: string;
  order_url: string; // страница заказа с токеном
}

/**
 * ⚠️ Заказ FC-26-000123 требует внимания: <reason>.
 * kind: payment_create_failed — текст «Ошибка создания платежа FC-26-000123: <reason>» (Edge Case 39);
 * paid_needs_attention — причина из orders.attention_reason (Edge Cases 11, 15, 43);
 * duplicate_payment — повторная оплата и автоматический возврат (Edge Case 36);
 * payment_currency_mismatch — succeeded-платёж не в RUB: сумма не учтена, mark_order_paid не вызывался;
 */
export interface AdminAttentionPayload {
  order_id: string;
  order_number: string;
  kind: "payment_create_failed" | "paid_needs_attention" | "duplicate_payment" | "payment_currency_mismatch";
  reason: string;
  admin_url: string;
}

/** По заказу FC-26-000123 оформлен возврат 133 700 ₽. Срок зачисления зависит от банка… */
export interface CustomerRefundPayload {
  order_number: string;
  amount: number;
  amount_formatted: string;
  order_url: string | null;
}

export interface NotificationPayloads {
  admin_order_paid: AdminOrderPaidPayload;
  customer_order_paid: CustomerOrderPaidPayload;
  admin_attention: AdminAttentionPayload;
  customer_refund: CustomerRefundPayload;
  // Шаблоны других дней — payload определяют их авторы.
  admin_atelier_applied: Record<string, unknown>;
  customer_status_changed: Record<string, unknown>;
  atelier_approved: Record<string, unknown>;
  atelier_rejected: Record<string, unknown>;
}

export type NotificationInput = {
  [T in NotificationTemplate]: { channel: NotificationChannel; recipient: string; template: T; payload: NotificationPayloads[T] };
}[NotificationTemplate];
