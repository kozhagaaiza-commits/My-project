import "server-only";
import { rubStringToKopecks } from "@/lib/money";
import type { OrderForPayment, PaymentMethodType } from "@/lib/payments/db";
import { getDefaultPaymentsDeps, type PaymentsDeps } from "@/lib/payments/deps";
import { notifyPaymentCreateFailed } from "@/lib/payments/notify";
import { linesTotal, toReceiptItems } from "@/lib/payments/receipt";
import { YookassaApiError, type YookassaPayment } from "@/lib/yookassa";

// КОНТРАКТ Дня 4 (payments-specialist).
// Создаёт платёж ЮKassa для заказа в pending_payment и сохраняет строку payments.
//  - attempt = (число строк payments по заказу) + 1; Idempotence-Key = `order_<orderId>_<attempt>` (Блок 5.9.1);
//  - reuseWithinSeconds: если у заказа есть платёж status='pending' моложе N секунд — вернуть его confirmation_url
//    (из payments.raw) без создания нового (POST /api/orders/[number]/pay: 10 мин; при создании заказа не задаётся);
//  - return_url строит сам модуль: orderPageUrl(number, orderToken(order.client_request_id)) + `&from=payment` (токен детерминирован, A28).
//
// Реализация (День 4):
//  - заказ не найден → throw PaymentOrderError("ORDER_NOT_FOUND"); не pending_payment или бронь истекла
//    (reserved_until ≤ now) → throw PaymentOrderError("ORDER_NOT_PAYABLE"). Это не ошибка провайдера: вызывающий
//    проверяет оплачиваемость сам (409 ORDER_NOT_PAYABLE / 404), исключение — страховка от гонки;
//  - 4xx ЮKassa → { ok:false, kind:"provider_rejected", message: description, yookassaCode } + admin_attention (Edge Case 39);
//  - сеть / таймаут / 5xx после 3 попыток (и ответ не той формы) → { ok:false, kind:"provider_unavailable" } (Edge Case 2);
//  - paymentId в результате — id платежа ЮKassa (payments.yookassa_payment_id);
//  - гонка вставки payments (одинаковый attempt у двух параллельных запросов → тот же Idempotence-Key → ЮKassa вернула
//    тот же платёж) — конфликт уникальности считается успехом, строка перечитывается.
export type CreatePaymentResult =
  | { ok: true; confirmationUrl: string; paymentId: string; reused: boolean }
  | { ok: false; kind: "provider_unavailable" | "provider_rejected"; message: string; yookassaCode?: string };

export interface CreatePaymentOptions {
  reuseWithinSeconds?: number;
}

export class PaymentOrderError extends Error {
  readonly code: "ORDER_NOT_FOUND" | "ORDER_NOT_PAYABLE";
  constructor(code: "ORDER_NOT_FOUND" | "ORDER_NOT_PAYABLE") {
    super(code);
    this.name = "PaymentOrderError";
    this.code = code;
  }
}

/** payments.payment_method_type: CHECK допускает только bank_card | sbp; прочие способы → null (полный ответ — в raw). */
export function paymentMethodType(p: Pick<YookassaPayment, "payment_method">): PaymentMethodType {
  const t = p.payment_method?.type;
  return t === "bank_card" || t === "sbp" ? t : null;
}

export function isPayable(order: Pick<OrderForPayment, "status" | "reserved_until">, now: Date): boolean {
  return order.status === "pending_payment" && order.reserved_until !== null && Date.parse(order.reserved_until) > now.getTime();
}

const UNAVAILABLE_MESSAGE = "Платёжный сервис временно недоступен";

export async function createPaymentForOrderWith(
  deps: PaymentsDeps, orderId: string, opts: CreatePaymentOptions = {},
): Promise<CreatePaymentResult> {
  const { repo, yookassa } = deps;
  const now = deps.now();
  const order = await repo.getOrder(orderId);
  if (!order) throw new PaymentOrderError("ORDER_NOT_FOUND");
  if (!isPayable(order, now)) throw new PaymentOrderError("ORDER_NOT_PAYABLE");

  const payments = await repo.listOrderPayments(orderId);

  if (opts.reuseWithinSeconds && opts.reuseWithinSeconds > 0) {
    const limitMs = opts.reuseWithinSeconds * 1000;
    const fresh = payments
      .filter((p) => p.status === "pending" && p.confirmation_url && now.getTime() - Date.parse(p.created_at) < limitMs)
      .at(-1);
    if (fresh?.confirmation_url) {
      return { ok: true, confirmationUrl: fresh.confirmation_url, paymentId: fresh.yookassa_payment_id, reused: true };
    }
  }

  const attempt = payments.length + 1;
  const idempotenceKey = `order_${orderId}_${attempt}`;
  const items = await repo.getOrderItems(orderId);
  if (items.length === 0) throw new Error(`payments.create: у заказа ${order.number} нет позиций`);
  if (linesTotal(items) !== order.total) {
    // В MVP доставка бесплатна (BR-11) — сумма позиций равна total; иначе ЮKassa отклонит чек (4xx → admin_attention).
    console.error({ scope: "payments.create", msg: "сумма позиций чека ≠ total заказа", order_number: order.number });
  }

  let payment: YookassaPayment;
  try {
    payment = await yookassa.createPayment({
      orderId, orderNumber: order.number, amount: order.total,
      email: order.customer_email, phone: order.customer_phone,
      items: toReceiptItems(items),
      returnUrl: `${deps.orderUrl(order.number, order.client_request_id)}&from=payment`,
      attempt,
    });
  } catch (err) {
    if (err instanceof YookassaApiError) {
      const description = err.yookassa.description ?? `HTTP ${err.status}`;
      console.error({ scope: "payments.create", order_number: order.number, attempt, status: err.status, yookassa: err.yookassa });
      await notifyPaymentCreateFailed(deps, order, description);
      return { ok: false, kind: "provider_rejected", message: description, ...(err.code ? { yookassaCode: err.code } : {}) };
    }
    console.error({ scope: "payments.create", order_number: order.number, attempt, err });
    return { ok: false, kind: "provider_unavailable", message: UNAVAILABLE_MESSAGE };
  }

  const inserted = await repo.insertPayment({
    order_id: orderId,
    yookassa_payment_id: payment.id,
    idempotence_key: idempotenceKey,
    status: payment.status,
    amount: rubStringToKopecks(payment.amount.value),
    payment_method_type: paymentMethodType(payment),
    cancellation_reason: payment.cancellation_details?.reason ?? null,
    raw: payment,
  });
  if ("conflict" in inserted) {
    const existing = await repo.findPayment(payment.id);
    if (!existing || existing.order_id !== orderId) {
      throw new Error(`payments.create: конфликт уникальности для ${idempotenceKey}, платёж ${payment.id} не найден у заказа`);
    }
  }

  const confirmationUrl = payment.confirmation?.confirmation_url;
  if (payment.status !== "pending" || !confirmationUrl) {
    // Платёж с этим ключом уже завершён (повтор после сбоя) или ответ без ссылки — оплатить по нему нельзя.
    console.error({ scope: "payments.create", msg: "платёж без confirmation_url", order_number: order.number, status: payment.status });
    return { ok: false, kind: "provider_unavailable", message: UNAVAILABLE_MESSAGE };
  }
  return { ok: true, confirmationUrl, paymentId: payment.id, reused: false };
}

export async function createPaymentForOrder(orderId: string, opts: CreatePaymentOptions = {}): Promise<CreatePaymentResult> {
  return createPaymentForOrderWith(await getDefaultPaymentsDeps(), orderId, opts);
}
