import "server-only";
import { rubStringToKopecks } from "@/lib/money";
import type { PaymentsDeps } from "@/lib/payments/deps";
import type { RefundProcessResult } from "@/lib/payments/process-types";
import { finalizeSucceededRefund } from "@/lib/payments/refund-finalize";
import type { YookassaRefund } from "@/lib/yookassa";

/**
 * refund.succeeded (объект — из GET /v3/refunds/{id}): refunds.status = 'succeeded', если ещё не succeeded (Блок 3, шаг 3).
 * Строка ищется по yookassa_refund_id; если её нет (ответ на POST /refunds не дошёл) — единственная строка того же платежа
 * без yookassa_refund_id с той же суммой. Дальше — общий finalizeSucceededRefund (тот же путь, что у ручного возврата
 * из админки): кто перевёл статус, тот переводит заказ в refunded при полном возврате, делает restock и ставит
 * customer_refund (ровно одно письмо).
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
        .filter((r) => r.yookassa_refund_id === null && r.amount === amount && (r.status === "pending" || r.status === "failed"));
      if (candidates.length === 1) row = candidates[0];
    }
  }
  if (!row) {
    console.error({ scope: "payments.refund", msg: "возврат не найден в refunds (создан вне сайта?)", refund_id: refund.id });
    return { kind: "refund_unknown" };
  }
  if (row.status === "succeeded") return { kind: "refund_already_succeeded", refundId: row.id };

  const { flipped } = await finalizeSucceededRefund(deps, row, refund.id);
  return flipped ? { kind: "refund_succeeded", refundId: row.id } : { kind: "refund_already_succeeded", refundId: row.id };
}
