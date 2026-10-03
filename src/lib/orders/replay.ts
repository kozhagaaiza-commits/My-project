// Чистые правила POST /api/orders и /pay без env и сети: кто вправе получить ссылку при повторе запроса,
// как логировать отказ платёжки (без ПДн), бюджет времени на платёж.
import type { CreatePaymentOptions } from "@/lib/payments/create";

/**
 * Повтор с client_request_id существующего заказа отдаёт ссылку (токен восстановим из client_request_id, A28)
 * только оформившему: email совпадает (без учёта регистра) и, если заказ привязан к аккаунту, — тот же пользователь.
 * Для только что созданного заказа условие выполняется всегда.
 */
export function isSameCustomer(
  order: { customer_email: string; user_id: string | null },
  who: { email: string; userId: string | null },
): boolean {
  if (order.customer_email.trim().toLowerCase() !== who.email.trim().toLowerCase()) return false;
  return order.user_id === null || order.user_id === who.userId;
}

/** Лог отказа платёжки структурой: без ПДн, без текста ЮKassa (в нём могут быть данные чека). */
export function logPaymentFailure(scope: string, orderId: string, p: { kind: string; yookassaCode?: string }) {
  console.error({ scope, orderId, kind: p.kind, yookassaCode: p.yookassaCode ?? null });
}

/**
 * Бюджет времени на платёж ЮKassa внутри запроса (maxDuration маршрута — 60 с): по исчерпании createPaymentForOrder
 * возвращает { ok:false } → 502 с order_url, заказ остаётся pending_payment (Edge Case 2).
 */
export const PAYMENT_DEADLINE_MS = 25_000;

/** deadlineMs — необязательное поле опций платежа (payments-specialist); пересечение совместимо и без него. */
export type OrderPaymentOptions = CreatePaymentOptions & { deadlineMs?: number };
