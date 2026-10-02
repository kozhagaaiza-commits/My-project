import "server-only";

// КОНТРАКТ Дня 4 (пишет payments-specialist; заглушка, чтобы остальные могли импортировать).
// Создаёт платёж ЮKassa для заказа в pending_payment и сохраняет строку payments.
//  - attempt = (число строк payments по заказу) + 1; Idempotence-Key = `order_<orderId>_<attempt>` (Блок 5.9.1);
//  - reuseWithinSeconds: если у заказа есть платёж status='pending' моложе N секунд — вернуть его confirmation_url
//    (из payments.raw) без создания нового (POST /api/orders/[number]/pay: 10 мин; при создании заказа не задаётся);
//  - return_url строит сам модуль: orderPageUrl(number, orderToken(order.client_request_id)) + `&from=payment` (токен детерминирован, A28).
export type CreatePaymentResult =
  | { ok: true; confirmationUrl: string; paymentId: string; reused: boolean }
  | { ok: false; kind: "provider_unavailable" | "provider_rejected"; message: string; yookassaCode?: string };

export interface CreatePaymentOptions {
  reuseWithinSeconds?: number;
}

export async function createPaymentForOrder(_orderId: string, _opts: CreatePaymentOptions = {}): Promise<CreatePaymentResult> {
  throw new Error("not implemented");
}
