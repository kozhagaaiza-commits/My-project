// Причина неудачной оплаты для страницы заказа (Блок 6, Edge Cases 35 и 37).
// В payments.cancellation_reason хранится код ЮKassa (cancellation_details.reason). Наружу код не отдаётся —
// только один из двух безопасных текстов Чертежа. Чистый модуль: без БД и env.

export const PAYMENT_BANK_DECLINED_TEXT = "Банк отклонил платёж. Попробуйте СБП или другую карту";
export const PAYMENT_FAILED_TEXT = "Оплата не прошла";

/**
 * Коды ЮKassa, при которых платёж отклонил банк-эмитент или платёжная система (Edge Case 35: лимит суммы,
 * ограничения карты, подозрение на мошенничество и т. п.) — помогает другой способ оплаты.
 * Остальные (insufficient_funds, expired_on_confirmation — покупатель отменил, 3d_secure_failed, internal_timeout,
 * неизвестные и null) — Edge Case 37 «Оплата не прошла».
 */
export const BANK_DECLINE_REASONS: ReadonlySet<string> = new Set([
  "payment_method_limit_exceeded",
  "payment_method_restricted",
  "call_issuer",
  "issuer_unavailable",
  "country_forbidden",
  "fraud_suspected",
  "general_decline",
  "card_expired",
  "invalid_card_number",
  "invalid_csc",
]);

export type PaymentRecordStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled";

/** Последний (по created_at) платёж заказа: только статус и код причины отмены. */
export interface LastPaymentRecord {
  status: PaymentRecordStatus;
  cancellation_reason: string | null;
}

/** Текст для покупателя — только если ПОСЛЕДНИЙ платёж отменён (новая попытка в процессе — текста нет). */
export function paymentFailureText(last: LastPaymentRecord | null): string | null {
  if (last === null || last.status !== "canceled") return null;
  return last.cancellation_reason !== null && BANK_DECLINE_REASONS.has(last.cancellation_reason)
    ? PAYMENT_BANK_DECLINED_TEXT
    : PAYMENT_FAILED_TEXT;
}
