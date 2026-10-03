import type { PaymentStatus } from "@/lib/payments/db-rows";
import type { YookassaRefund } from "@/lib/yookassa/schemas";

// Результаты общего пути обработки платежей и возвратов (для логов, webhook и тестов). Чистый модуль.

/**
 * Итог по одному автоматическому возврату повторной оплаты (Edge Case 36):
 * succeeded / pending (ждём refund.succeeded) / failed (только вручную, admin_attention «Верните вручную») /
 * retry_scheduled (сбой сети или 5xx ЮKassa: один автоповтор с тем же refund_<id> при следующей обработке) /
 * in_progress (возврат прямо сейчас оформляет другой обработчик).
 */
export type DuplicateRefundOutcome = {
  payment_id: string; // yookassa_payment_id возвращаемого платежа
  refund_id: string | null; // refunds.id (null — строку создал другой обработчик, индекс uq_refunds_duplicate_payment)
  status: "succeeded" | "pending" | "failed" | "retry_scheduled" | "in_progress";
};

export type ProcessResult =
  | { kind: "paid"; orderId: string; mark: "paid" | "paid_needs_attention" }
  | { kind: "already_paid"; orderId: string }
  | { kind: "refunded_duplicate"; orderId: string; refunds: DuplicateRefundOutcome[] }
  | { kind: "currency_mismatch"; orderId: string; currency: string }
  | { kind: "canceled"; orderId: string; reason: string | null }
  | { kind: "updated"; orderId: string; status: PaymentStatus }
  | { kind: "stale"; orderId: string; status: PaymentStatus }
  | { kind: "ignored"; reason: "no_order_id" | "unknown_order" };

export type RefundProcessResult =
  | { kind: "refund_succeeded"; refundId: string }
  | { kind: "refund_already_succeeded"; refundId: string }
  | { kind: "refund_not_succeeded"; status: YookassaRefund["status"] }
  | { kind: "refund_unknown" };

/** Нужна повторная доставка уведомления (webhook → 500): автовозврат упал на сети/5xx и ждёт одного повтора. */
export function needsRedelivery(r: ProcessResult): boolean {
  return r.kind === "refunded_duplicate" && r.refunds.some((o) => o.status === "retry_scheduled");
}
