import "server-only";
import type { PaymentRow } from "@/lib/payments/db";
import { getDefaultPaymentsDeps, type PaymentsDeps } from "@/lib/payments/deps";
import { processPaymentObjectWith, type ProcessResult } from "@/lib/payments/process";

// Сверка платежей, если webhook не дошёл (Чертёж 5.9.1 «Fallback», Edge Case 4, 5.12 шаг 4).
//  - reconcileOrderPayments(orderId) — для GET /api/orders/[number] (День 5): заказ в pending_payment (или cancelled —
//    перед чтением страница вызывает cancel_expired_orders, а оплата после истечения брони принимается, Edge Case 43),
//    платежи status='pending', последняя проверка (payments.updated_at) старше 60 с → GET /v3/payments/{id} →
//    processPaymentObject (тот же путь, что webhook). Каждая проверка обновляет строку payments → updated_at сдвигается.
//  - reconcileStalePayments() — для cron (День 7): все payments.status='pending' младше 48 ч.
// Ни одна функция не бросает: страница заказа и cron не должны падать из-за ЮKassa/БД; ошибки — в лог и в итог.

export const RECONCILE_MIN_INTERVAL_SECONDS = 60;
export const RECONCILE_MAX_AGE_HOURS = 48;
const RECONCILABLE_ORDER_STATUSES = new Set(["pending_payment", "cancelled"]);

export type ReconcileItem =
  | { payment_id: string; ok: true; result: ProcessResult }
  | { payment_id: string; ok: false; error: string };

export interface ReconcileSummary {
  checked: number;
  paid: number;
  failed: number;
  items: ReconcileItem[];
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
    if (!order || !RECONCILABLE_ORDER_STATUSES.has(order.status)) return EMPTY;
    const nowMs = deps.now().getTime();
    const due = (await deps.repo.listOrderPayments(orderId)).filter(
      (p) => p.status === "pending" && nowMs - Date.parse(p.updated_at) > RECONCILE_MIN_INTERVAL_SECONDS * 1000,
    );
    return await runAll(deps, due);
  } catch (err) {
    console.error({ scope: "payments.reconcileOrder", order_id: orderId, err });
    return { ...EMPTY, failed: 1 };
  }
}

export async function reconcileStalePaymentsWith(deps: PaymentsDeps): Promise<ReconcileSummary> {
  try {
    const since = new Date(deps.now().getTime() - RECONCILE_MAX_AGE_HOURS * 3600 * 1000).toISOString();
    return await runAll(deps, await deps.repo.listPendingPaymentsSince(since));
  } catch (err) {
    console.error({ scope: "payments.reconcileStale", err });
    return { ...EMPTY, failed: 1 };
  }
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
