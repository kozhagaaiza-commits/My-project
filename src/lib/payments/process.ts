import "server-only";
import { z } from "zod";
import { rubStringToKopecks } from "@/lib/money";
import type { PaymentStatus } from "@/lib/payments/db-rows";
import { getDefaultPaymentsDeps, type PaymentsDeps } from "@/lib/payments/deps";
import { paymentMethodType } from "@/lib/payments/create";
import { handleAlreadyPaid } from "@/lib/payments/duplicates";
import { notifyAdminAttention, notifyOrderPaid } from "@/lib/payments/notify";
import type { ProcessResult, RefundProcessResult } from "@/lib/payments/process-types";
import { processRefundObjectWith } from "@/lib/payments/refund-events";
import type { YookassaPayment, YookassaRefund } from "@/lib/yookassa";

// Общий путь обработки платежа ЮKassa для webhook, сверки при открытии заказа и cron (Чертёж 5.9.1, Блок 3 webhook).
// ВХОД — объект, полученный НАШИМ запросом GET /v3/payments/{id} (тело уведомления не доверенное, BR-12, Edge Case 26).
//  1. Заказ — по строке payments (наша БД); строки нет (сбой между созданием платежа и insert) — по metadata.order_id
//     из ответа API, заказ должен существовать; строка восстанавливается (idempotence_key `recovered_<id>`, статус pending).
//  2. succeeded: СНАЧАЛА rpc mark_order_paid(order_id, сумма ИЗ ОТВЕТА API) — критичный шаг; затем уведомления (только при
//     paid / paid_needs_attention, Edge Case 16); ЗАТЕМ строка payments → succeeded. Сбой на любом шаге → исключение
//     (webhook 500, ЮKassa повторит; сверка подхватывает и pending, и succeeded-платежи неоплаченных заказов), и заказ
//     с деньгами не отменится по истечении брони. already_paid → проверка повторной оплаты (duplicates.ts, Edge Case 36).
//     Валюта не RUB → mark_order_paid НЕ вызывается: needs_attention + admin_attention (один раз).
//  3. canceled / pending / waiting_for_capture → только payments, заказ не трогается (Edge Cases 35, 37).
//  Статус строки payments не откатывается назад (устаревший ответ pending после succeeded не применяется).

export type { DuplicateRefundOutcome, ProcessResult, RefundProcessResult } from "@/lib/payments/process-types";
export { needsRedelivery } from "@/lib/payments/process-types";
export { DUPLICATE_REFUND_REASON, pickPrimaryPayment } from "@/lib/payments/duplicates";
export { processRefundObjectWith } from "@/lib/payments/refund-events";

export const NOTIFY_FAILED_REASON = "Уведомление об оплате не поставлено в очередь";

/** Из каких текущих статусов строки payments допустим переход в новый (ЮKassa: succeeded и canceled — финальные). */
export const PAYMENT_STATUS_ALLOWED_FROM: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ["pending"],
  waiting_for_capture: ["pending", "waiting_for_capture"],
  succeeded: ["pending", "waiting_for_capture", "succeeded"],
  canceled: ["pending", "waiting_for_capture", "canceled"],
};

const uuid = z.uuid();

async function resolveOrderId(deps: PaymentsDeps, payment: YookassaPayment): Promise<string | ProcessResult> {
  const { repo } = deps;
  const metaRaw = payment.metadata?.order_id;
  const metaOrderId = typeof metaRaw === "string" && uuid.safeParse(metaRaw).success ? metaRaw : null;

  const row = await repo.findPayment(payment.id);
  if (row) {
    if (metaOrderId && metaOrderId !== row.order_id) {
      console.error({ scope: "payments.process", msg: "metadata.order_id ≠ payments.order_id, используется БД", payment_id: payment.id });
    }
    return row.order_id;
  }
  if (!metaOrderId) {
    console.error({ scope: "payments.process", msg: "платёж без строки payments и без metadata.order_id", payment_id: payment.id });
    return { kind: "ignored", reason: "no_order_id" };
  }
  if (!(await repo.getOrder(metaOrderId))) {
    console.error({ scope: "payments.process", msg: "заказ из metadata не найден", payment_id: payment.id, order_id: metaOrderId });
    return { kind: "ignored", reason: "unknown_order" };
  }
  // Восстановление строки: платёж создан в ЮKassa, но insert в payments не состоялся. succeeded ставится только после
  // mark_order_paid, поэтому строка вставляется как pending.
  const ins = await repo.insertPayment({
    order_id: metaOrderId,
    yookassa_payment_id: payment.id,
    idempotence_key: `recovered_${payment.id}`,
    status: payment.status === "succeeded" ? "pending" : payment.status,
    amount: rubStringToKopecks(payment.amount.value),
    payment_method_type: paymentMethodType(payment),
    cancellation_reason: payment.cancellation_details?.reason ?? null,
    raw: payment,
  });
  if ("conflict" in ins) {
    const again = await repo.findPayment(payment.id);
    if (!again) throw new Error(`payments.process: конфликт вставки, строка ${payment.id} не найдена`);
    return again.order_id;
  }
  console.error({ scope: "payments.process", msg: "строка payments восстановлена по metadata.order_id", payment_id: payment.id });
  return metaOrderId;
}

async function flagQuietly(deps: PaymentsDeps, orderId: string, reason: string) {
  try {
    await deps.repo.flagOrderAttention(orderId, reason);
  } catch (err) {
    console.error({ scope: "payments.process", msg: "needs_attention не поставлен", order_id: orderId, reason, err });
  }
}

/** Уведомления об оплате. Заказ уже оплачен: сбой здесь не даёт 500 (повтор вернул бы already_paid без уведомлений),
 * а помечает заказ needs_attention «Уведомление об оплате не поставлено в очередь». */
async function notifyPaid(deps: PaymentsDeps, orderId: string, mark: "paid" | "paid_needs_attention") {
  let queued = false;
  try {
    const order = await deps.repo.getOrder(orderId);
    if (!order) throw new Error(`заказ ${orderId} не найден`);
    const items = await deps.repo.getOrderItems(orderId);
    const reason = mark === "paid_needs_attention" ? ((await deps.repo.getAttentionReason(orderId)) ?? "Требует проверки") : null;
    queued = await notifyOrderPaid(deps, order, items, reason);
  } catch (err) {
    console.error({ scope: "payments.process", msg: "уведомления об оплате не поставлены", order_id: orderId, err });
  }
  if (!queued) await flagQuietly(deps, orderId, NOTIFY_FAILED_REASON);
}

async function currencyMismatch(deps: PaymentsDeps, orderId: string, payment: YookassaPayment): Promise<ProcessResult> {
  const currency = payment.amount.currency;
  console.error({ scope: "payments.process", msg: "валюта платежа не RUB, mark_order_paid не вызван", payment_id: payment.id, currency });
  if (!(await deps.repo.getAttentionReason(orderId))?.includes(payment.id)) {
    const reason = `Платёж ${payment.id} в валюте ${currency} на ${payment.amount.value}: оплата не учтена, проверьте вручную`;
    await deps.repo.flagOrderAttention(orderId, reason);
    const order = await deps.repo.getOrder(orderId);
    if (order) await notifyAdminAttention(deps, order, "payment_currency_mismatch", reason);
  }
  return { kind: "currency_mismatch", orderId, currency };
}

export async function processPaymentObjectWith(deps: PaymentsDeps, payment: YookassaPayment): Promise<ProcessResult> {
  const resolved = await resolveOrderId(deps, payment);
  if (typeof resolved !== "string") return resolved;
  const orderId = resolved;
  const patch = {
    status: payment.status,
    payment_method_type: paymentMethodType(payment),
    cancellation_reason: payment.cancellation_details?.reason ?? null,
    raw: payment,
  };
  const allowedFrom = PAYMENT_STATUS_ALLOWED_FROM[payment.status];

  if (payment.status !== "succeeded") {
    if (!(await deps.repo.updatePayment(payment.id, patch, allowedFrom))) return { kind: "stale", orderId, status: payment.status };
    return payment.status === "canceled"
      ? { kind: "canceled", orderId, reason: payment.cancellation_details?.reason ?? null }
      : { kind: "updated", orderId, status: payment.status };
  }

  if (payment.amount.currency !== "RUB") {
    await deps.repo.updatePayment(payment.id, patch, allowedFrom);
    return currencyMismatch(deps, orderId, payment);
  }
  const mark = await deps.repo.markOrderPaid(orderId, rubStringToKopecks(payment.amount.value));
  if (mark !== "already_paid") await notifyPaid(deps, orderId, mark);
  if (!(await deps.repo.updatePayment(payment.id, patch, allowedFrom))) {
    console.error({ scope: "payments.process", msg: "строка payments не переведена в succeeded (статус canceled?)", payment_id: payment.id });
  }
  return mark === "already_paid" ? handleAlreadyPaid(deps, orderId, payment) : { kind: "paid", orderId, mark };
}

export async function processPaymentObject(payment: YookassaPayment): Promise<ProcessResult> {
  return processPaymentObjectWith(await getDefaultPaymentsDeps(), payment);
}

export async function processRefundObject(refund: YookassaRefund): Promise<RefundProcessResult> {
  return processRefundObjectWith(await getDefaultPaymentsDeps(), refund);
}
