import "server-only";
import { z } from "zod";
import { formatRub, rubStringToKopecks } from "@/lib/money";
import type { OrderForPayment, OrderItemRow, PaymentRow, PaymentStatus, RefundStatus } from "@/lib/payments/db";
import { getDefaultPaymentsDeps, type PaymentsDeps } from "@/lib/payments/deps";
import { paymentMethodType } from "@/lib/payments/create";
import { notifyCustomerRefund, notifyDuplicatePayment, notifyOrderPaid } from "@/lib/payments/notify";
import { refundReceiptItems } from "@/lib/payments/receipt";
import { YookassaApiError, buildReceipt, type YookassaPayment, type YookassaRefund } from "@/lib/yookassa";

// Общий путь обработки платежа ЮKassa для webhook, сверки при открытии заказа и cron (Чертёж 5.9.1, Блок 3 webhook).
// ВХОД — объект, полученный НАШИМ запросом GET /v3/payments/{id} (тело уведомления не доверенное, BR-12, Edge Case 26).
//  1. Заказ — по строке payments (наша БД); строки нет (сбой между созданием платежа и insert) — по metadata.order_id
//     из ответа API, заказ должен существовать; строка payments восстанавливается (idempotence_key `recovered_<id>`).
//  2. payments: status, payment_method_type, raw, cancellation_reason. Статус не откатывается назад
//     (устаревший ответ pending после succeeded не применяется).
//  3. succeeded → rpc mark_order_paid(order_id, сумма ИЗ ОТВЕТА API). Уведомления — ТОЛЬКО при paid / paid_needs_attention
//     (Edge Case 16). already_paid + другой succeeded-платёж → повторная оплата (Edge Case 36): полный возврат, needs_attention,
//     admin_attention. canceled / pending / waiting_for_capture → только payments, заказ не трогается (Edge Cases 35, 37).
// Идемпотентность: повторный вызов даёт already_paid (без уведомлений); возврат создаётся, только если по платежу ещё нет
// ни одной строки refunds.
//
// Какой платёж возвращать при повторной оплате. Чертёж: «полный возврат ЭТОГО платежа». Чтобы повторная доставка
// уведомления по ПЕРВОМУ платежу не вернула и его, «основной» платёж выбирается детерминированно — самый ранний по
// captured_at (затем created_at, id); возвращаются все остальные succeeded-платежи заказа без возвратов.
// В обычном сценарии (второй платёж пришёл позже) это и есть «этот» платёж.

export const DUPLICATE_REFUND_REASON = "Повторная оплата";

export type DuplicateRefundOutcome = {
  payment_id: string; // yookassa_payment_id
  refund_id: string; // refunds.id
  status: Extract<RefundStatus, "pending" | "succeeded" | "failed">;
};

export type ProcessResult =
  | { kind: "paid"; orderId: string; mark: "paid" | "paid_needs_attention" }
  | { kind: "already_paid"; orderId: string }
  | { kind: "refunded_duplicate"; orderId: string; refunds: DuplicateRefundOutcome[] }
  | { kind: "canceled"; orderId: string; reason: string | null }
  | { kind: "updated"; orderId: string; status: PaymentStatus }
  | { kind: "stale"; orderId: string; status: PaymentStatus }
  | { kind: "ignored"; reason: "no_order_id" | "unknown_order" };

/** Из каких текущих статусов строки payments допустим переход в новый (ЮKassa: succeeded и canceled — финальные). */
export const PAYMENT_STATUS_ALLOWED_FROM: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ["pending"],
  waiting_for_capture: ["pending", "waiting_for_capture"],
  succeeded: ["pending", "waiting_for_capture", "succeeded"],
  canceled: ["pending", "waiting_for_capture", "canceled"],
};

const uuid = z.uuid();
const ts = (s: string | null) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
};

/** Основной платёж заказа среди succeeded: самый ранний captured_at, затем created_at, затем id. */
export function pickPrimaryPayment(succeeded: PaymentRow[]): PaymentRow | null {
  return [...succeeded].sort((a, b) =>
    ts(a.captured_at) - ts(b.captured_at) || ts(a.created_at) - ts(b.created_at)
    || a.yookassa_payment_id.localeCompare(b.yookassa_payment_id),
  )[0] ?? null;
}

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
  const order = await repo.getOrder(metaOrderId);
  if (!order) {
    console.error({ scope: "payments.process", msg: "заказ из metadata не найден", payment_id: payment.id, order_id: metaOrderId });
    return { kind: "ignored", reason: "unknown_order" };
  }
  // Восстановление строки: платёж создан в ЮKassa, но insert в payments не состоялся.
  const ins = await repo.insertPayment({
    order_id: metaOrderId,
    yookassa_payment_id: payment.id,
    idempotence_key: `recovered_${payment.id}`,
    status: payment.status,
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

async function loadOrderWithItems(deps: PaymentsDeps, orderId: string): Promise<{ order: OrderForPayment; items: OrderItemRow[] }> {
  const order = await deps.repo.getOrder(orderId);
  if (!order) throw new Error(`payments.process: заказ ${orderId} не найден`);
  return { order, items: await deps.repo.getOrderItems(orderId) };
}

async function notifyPaid(deps: PaymentsDeps, orderId: string, mark: "paid" | "paid_needs_attention") {
  // Заказ уже оплачен: сбой чтения для уведомлений не должен давать 500 (повтор вернул бы already_paid без уведомлений).
  try {
    const { order, items } = await loadOrderWithItems(deps, orderId);
    const reason = mark === "paid_needs_attention" ? ((await deps.repo.getAttentionReason(orderId)) ?? "Требует проверки") : null;
    await notifyOrderPaid(deps, order, items, reason);
  } catch (err) {
    console.error({ scope: "payments.process", msg: "уведомления об оплате не поставлены", order_id: orderId, err });
  }
}

function errorText(err: unknown): string {
  if (err instanceof YookassaApiError) return err.yookassa.description ?? `HTTP ${err.status}`;
  return err instanceof Error ? err.message : String(err);
}

async function refundDuplicate(
  deps: PaymentsDeps, order: OrderForPayment, items: OrderItemRow[], p: PaymentRow,
): Promise<DuplicateRefundOutcome> {
  const { repo, yookassa } = deps;
  const amountText = formatRub(p.amount);
  const refund = await repo.insertRefund({ order_id: order.id, payment_id: p.id, amount: p.amount, reason: DUPLICATE_REFUND_REASON, restock: false });
  await repo.flagOrderAttention(order.id, `Повторная оплата: платёж ${p.yookassa_payment_id}, автоматический возврат ${amountText}`);

  let response: YookassaRefund | null = null;
  let failure: string | null = null;
  try {
    response = await yookassa.createRefund({
      refundId: refund.id,
      paymentId: p.yookassa_payment_id,
      amount: p.amount,
      description: `Возврат по заказу ${order.number}`,
      receipt: buildReceipt({ email: order.customer_email, phone: order.customer_phone, items: refundReceiptItems(items, p.amount) }),
    });
  } catch (err) {
    failure = errorText(err);
    console.error({ scope: "payments.duplicateRefund", order_number: order.number, refund_id: refund.id, err });
  }

  let status: DuplicateRefundOutcome["status"];
  if (response?.status === "succeeded") {
    status = "succeeded";
    if (await repo.markRefundSucceeded(refund.id, response.id)) await notifyCustomerRefund(deps, order, p.amount);
  } else if (response?.status === "pending") {
    status = "pending";
    await repo.updateRefund(refund.id, { status: "pending", yookassa_refund_id: response.id });
  } else {
    status = "failed";
    failure ??= response?.cancellation_details?.reason ?? "ЮKassa отменила возврат";
    await repo.updateRefund(refund.id, {
      status: "failed", error_message: failure.slice(0, 500), ...(response ? { yookassa_refund_id: response.id } : {}),
    });
  }

  const reason = status === "succeeded"
    ? `Повторная оплата: оформлен автоматический возврат ${amountText} (платёж ${p.yookassa_payment_id})`
    : status === "pending"
      ? `Повторная оплата: автоматический возврат ${amountText} в обработке (платёж ${p.yookassa_payment_id})`
      : `Повторная оплата: автоматический возврат ${amountText} не прошёл (${failure}). Верните вручную (платёж ${p.yookassa_payment_id})`;
  await notifyDuplicatePayment(deps, order, reason);
  return { payment_id: p.yookassa_payment_id, refund_id: refund.id, status };
}

async function handleAlreadyPaid(deps: PaymentsDeps, orderId: string): Promise<ProcessResult> {
  const succeeded = (await deps.repo.listOrderPayments(orderId)).filter((p) => p.status === "succeeded");
  if (succeeded.length < 2) return { kind: "already_paid", orderId };

  const primary = pickPrimaryPayment(succeeded);
  const refunds = await deps.repo.listOrderRefunds(orderId);
  const targets = succeeded.filter((p) => p.id !== primary?.id && !refunds.some((r) => r.payment_id === p.id));
  if (targets.length === 0) return { kind: "already_paid", orderId };

  const { order, items } = await loadOrderWithItems(deps, orderId);
  const outcomes: DuplicateRefundOutcome[] = [];
  for (const p of targets) outcomes.push(await refundDuplicate(deps, order, items, p));
  return { kind: "refunded_duplicate", orderId, refunds: outcomes };
}

export async function processPaymentObjectWith(deps: PaymentsDeps, payment: YookassaPayment): Promise<ProcessResult> {
  const resolved = await resolveOrderId(deps, payment);
  if (typeof resolved !== "string") return resolved;
  const orderId = resolved;

  const updated = await deps.repo.updatePayment(payment.id, {
    status: payment.status,
    payment_method_type: paymentMethodType(payment),
    cancellation_reason: payment.cancellation_details?.reason ?? null,
    raw: payment,
  }, PAYMENT_STATUS_ALLOWED_FROM[payment.status]);
  if (!updated) return { kind: "stale", orderId, status: payment.status };

  switch (payment.status) {
    case "succeeded": {
      if (payment.amount.currency !== "RUB") {
        console.error({ scope: "payments.process", msg: "валюта платежа не RUB", payment_id: payment.id, currency: payment.amount.currency });
      }
      const mark = await deps.repo.markOrderPaid(orderId, rubStringToKopecks(payment.amount.value));
      if (mark === "already_paid") return handleAlreadyPaid(deps, orderId);
      await notifyPaid(deps, orderId, mark);
      return { kind: "paid", orderId, mark };
    }
    case "canceled":
      return { kind: "canceled", orderId, reason: payment.cancellation_details?.reason ?? null };
    default:
      return { kind: "updated", orderId, status: payment.status };
  }
}

// ---------- Возвраты (refund.succeeded) ----------

export type RefundProcessResult =
  | { kind: "refund_succeeded"; refundId: string }
  | { kind: "refund_already_succeeded"; refundId: string }
  | { kind: "refund_not_succeeded"; status: YookassaRefund["status"] }
  | { kind: "refund_unknown" };

/**
 * refund.succeeded (объект — из GET /v3/refunds/{id}): refunds.status = 'succeeded', если ещё не succeeded (Блок 3, шаг 3).
 * Строка ищется по yookassa_refund_id; если её нет (ответ на POST /refunds не дошёл) — единственная строка того же платежа
 * без yookassa_refund_id с той же суммой. Кто перевёл статус, тот ставит customer_refund (ровно одно письмо).
 */
export async function processRefundObjectWith(deps: PaymentsDeps, refund: YookassaRefund): Promise<RefundProcessResult> {
  const { repo } = deps;
  if (refund.status !== "succeeded") return { kind: "refund_not_succeeded", status: refund.status };
  const amount = rubStringToKopecks(refund.amount.value);

  let row = await repo.findRefundByYookassaId(refund.id);
  if (!row) {
    const payment = await repo.findPayment(refund.payment_id);
    if (payment) {
      const candidates = (await repo.listPaymentRefunds(payment.id))
        .filter((r) => r.yookassa_refund_id === null && r.amount === amount && r.status !== "succeeded");
      if (candidates.length === 1) row = candidates[0];
    }
  }
  if (!row) {
    console.error({ scope: "payments.refund", msg: "возврат не найден в refunds (создан вне сайта?)", refund_id: refund.id });
    return { kind: "refund_unknown" };
  }
  if (row.status === "succeeded") return { kind: "refund_already_succeeded", refundId: row.id };

  const flipped = await repo.markRefundSucceeded(row.id, refund.id);
  if (!flipped) return { kind: "refund_already_succeeded", refundId: row.id };
  try {
    const order = await repo.getOrder(row.order_id);
    if (order) await notifyCustomerRefund(deps, order, row.amount);
  } catch (err) {
    console.error({ scope: "payments.refund", msg: "customer_refund не поставлен", refund_id: row.id, err });
  }
  return { kind: "refund_succeeded", refundId: row.id };
}

export async function processPaymentObject(payment: YookassaPayment): Promise<ProcessResult> {
  return processPaymentObjectWith(await getDefaultPaymentsDeps(), payment);
}

export async function processRefundObject(refund: YookassaRefund): Promise<RefundProcessResult> {
  return processRefundObjectWith(await getDefaultPaymentsDeps(), refund);
}
