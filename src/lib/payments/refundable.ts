// Суммы оплаты и возвратов заказа (Блок 3 «POST /api/admin/orders/[id]/refund», шаг 1; BR-16). Чистый модуль:
// без БД и env — его же может использовать GET /api/admin/orders/[id] (paid_amount / refunded_amount / refundable_amount),
// чтобы сумма по умолчанию в Dialog возврата совпадала с проверкой сервера.
//
// Возврат в ЮKassa оформляется по ОДНОМУ платежу и не больше его остатка. При одном платеже (обычный случай)
// refundable_amount = paid_amount − Σ refunds(pending|succeeded), ровно как в Чертеже. При нескольких succeeded-платежах
// (повторная оплата, Edge Case 36) один запрос не может вернуть больше остатка одного платежа — поэтому
// refundable_amount = максимум остатка по одному платежу (он же ≤ формулы Чертежа).

export interface RefundablePayment {
  id: string;
  status: string;
  amount: number;
}
export interface RefundableRefund {
  payment_id: string;
  amount: number;
  status: string;
}

export interface RefundTotals {
  /** Σ succeeded-платежей (и платежей, по которым уже есть возврат pending|succeeded, даже если строка ещё не обновлена). */
  paid_amount: number;
  /** Σ возвратов succeeded. */
  refunded_amount: number;
  /** Σ возвратов pending (уже занимают сумму к возврату). */
  pending_refund_amount: number;
  /** Максимум одного нового возврата (см. выше). 0 — возвращать нечего. */
  refundable_amount: number;
  /** Остаток к возврату по каждому succeeded-платежу (payments.id → копейки). */
  by_payment: Map<string, number>;
}

const HOLDS = new Set(["pending", "succeeded"]);

export function refundTotals(payments: RefundablePayment[], refunds: RefundableRefund[]): RefundTotals {
  const held = new Map<string, number>();
  let refunded = 0;
  let pending = 0;
  for (const r of refunds) {
    if (!HOLDS.has(r.status)) continue;
    held.set(r.payment_id, (held.get(r.payment_id) ?? 0) + r.amount);
    if (r.status === "succeeded") refunded += r.amount;
    else pending += r.amount;
  }
  let paid = 0;
  const byPayment = new Map<string, number>();
  for (const p of payments) {
    if (p.status === "succeeded" || held.has(p.id)) paid += p.amount;
    if (p.status === "succeeded") byPayment.set(p.id, Math.max(0, p.amount - (held.get(p.id) ?? 0)));
  }
  const refundable = Math.max(0, ...byPayment.values());
  return { paid_amount: paid, refunded_amount: refunded, pending_refund_amount: pending, refundable_amount: refundable, by_payment: byPayment };
}

/** Полный возврат: всё оплаченное возвращено (succeeded) — заказ переходит в refunded. */
export const isFullyRefunded = (t: Pick<RefundTotals, "paid_amount" | "refunded_amount">) =>
  t.paid_amount > 0 && t.refunded_amount >= t.paid_amount;
