import "server-only";
import { UNPAID_ORDER_STATUSES, type PaymentRow } from "@/lib/payments/db-rows";
import { getDefaultPaymentsDeps, type PaymentsDeps } from "@/lib/payments/deps";
import { resumeOpenDuplicateRefunds } from "@/lib/payments/duplicates";
import { processPaymentObjectWith } from "@/lib/payments/process";
import type { DuplicateRefundOutcome, ProcessResult } from "@/lib/payments/process-types";
import { refreshPendingRefundsSince, type RefreshSummary } from "@/lib/payments/refund-refresh";

// Сверка платежей, если webhook не дошёл или обработка оборвалась (Чертёж 5.9.1 «Fallback», Edge Case 4, 5.12 шаг 4).
//  - reconcileOrderPayments(orderId) — для GET /api/orders/[number] (День 5): заказ в pending_payment или cancelled
//    (страница перед чтением вызывает cancel_expired_orders, а оплата после истечения брони принимается, Edge Case 43);
//    платежи pending И succeeded (succeeded у неоплаченного заказа — сбой между mark_order_paid и уведомлениями/строкой),
//    последняя проверка (payments.updated_at) старше 60 с → GET /v3/payments/{id} → processPaymentObject.
//    Каждая проверка обновляет строку payments → updated_at сдвигается (не чаще раза в 60 с).
//  - reconcileStalePayments() — для cron (День 7): все pending младше 48 ч + все succeeded у неоплаченных заказов
//    + незавершённые автоматические возвраты повторной оплаты (сироты, один автоповтор после сети/5xx)
//    + pending ручные возвраты (GET /v3/refunds: succeeded → общий finalizeSucceededRefund, canceled → failed;
//    у ЮKassa нет уведомления об отмене возврата), День 6.
// Ни одна функция не бросает: страница заказа и cron не должны падать из-за ЮKassa/БД; ошибки — в лог и в итог.

export const RECONCILE_MIN_INTERVAL_SECONDS = 60;
export const RECONCILE_MAX_AGE_HOURS = 48;
const UNPAID = new Set<string>(UNPAID_ORDER_STATUSES);

export type ReconcileItem =
  | { payment_id: string; ok: true; result: ProcessResult }
  | { payment_id: string; ok: false; error: string };

export interface ReconcileSummary {
  checked: number;
  paid: number;
  failed: number;
  items: ReconcileItem[];
  /** Только cron: продолженные автоматические возвраты повторной оплаты. */
  refunds?: DuplicateRefundOutcome[];
  /** Только cron: доводка pending ручных возвратов (refund-refresh.ts). */
  manual_refunds?: RefreshSummary;
}

async function reconcileOne(deps: PaymentsDeps, p: PaymentRow): Promise<ReconcileItem> {
  try {
    const payment = await deps.yookassa.getPayment(p.yookassa_payment_id);
    return { payment_id: p.yookassa_payment_id, ok: true, result: await processPaymentObjectWith(deps, payment) };
  } catch (err) {
    console.error({ scope: "payments.reconcile", payment_id: p.yookassa_payment_id, err });
    return { payment_id: p.yookassa_payment_id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function runAll(deps: PaymentsDeps, payments: PaymentRow[]): Promise<ReconcileSummary> {
  const items: ReconcileItem[] = [];
  for (const p of payments) items.push(await reconcileOne(deps, p)); // последовательно: без всплеска запросов к ЮKassa
  return {
    checked: items.length,
    paid: items.filter((i) => i.ok && i.result.kind === "paid").length,
    failed: items.filter((i) => !i.ok).length,
    items,
  };
}

const EMPTY: ReconcileSummary = { checked: 0, paid: 0, failed: 0, items: [] };

export async function reconcileOrderPaymentsWith(deps: PaymentsDeps, orderId: string): Promise<ReconcileSummary> {
  try {
    const order = await deps.repo.getOrder(orderId);
    if (!order || !UNPAID.has(order.status)) return EMPTY;
    const nowMs = deps.now().getTime();
    const due = (await deps.repo.listOrderPayments(orderId)).filter(
      (p) => (p.status === "pending" || p.status === "succeeded")
        && nowMs - Date.parse(p.updated_at) > RECONCILE_MIN_INTERVAL_SECONDS * 1000,
    );
    return await runAll(deps, due);
  } catch (err) {
    console.error({ scope: "payments.reconcileOrder", order_id: orderId, err });
    return { ...EMPTY, failed: 1 };
  }
}

export async function reconcileStalePaymentsWith(deps: PaymentsDeps): Promise<ReconcileSummary> {
  const since = new Date(deps.now().getTime() - RECONCILE_MAX_AGE_HOURS * 3600 * 1000).toISOString();
  let summary: ReconcileSummary;
  try {
    const pending = await deps.repo.listPendingPaymentsSince(since);
    const succeeded = await deps.repo.listSucceededPaymentsOfUnpaidOrders();
    const seen = new Set<string>();
    summary = await runAll(deps, [...pending, ...succeeded].filter((p) => !seen.has(p.id) && seen.add(p.id)));
  } catch (err) {
    console.error({ scope: "payments.reconcileStale", err });
    summary = { ...EMPTY, failed: 1 };
  }
  try {
    summary.refunds = await resumeOpenDuplicateRefunds(deps, since);
  } catch (err) {
    console.error({ scope: "payments.reconcileStale.refunds", err });
    summary.failed += 1;
  }
  try {
    summary.manual_refunds = await refreshPendingRefundsSince(deps, since);
    summary.failed += summary.manual_refunds.errors;
  } catch (err) {
    console.error({ scope: "payments.reconcileStale.manualRefunds", err });
    summary.failed += 1;
  }
  return summary;
}

export async function reconcileOrderPayments(orderId: string): Promise<ReconcileSummary> {
  try {
    return await reconcileOrderPaymentsWith(await getDefaultPaymentsDeps(), orderId);
  } catch (err) {
    console.error({ scope: "payments.reconcileOrder", order_id: orderId, err });
    return { ...EMPTY, failed: 1 };
  }
}

export async function reconcileStalePayments(): Promise<ReconcileSummary> {
  try {
    return await reconcileStalePaymentsWith(await getDefaultPaymentsDeps());
  } catch (err) {
    console.error({ scope: "payments.reconcileStale", err });
    return { ...EMPTY, failed: 1 };
  }
}
