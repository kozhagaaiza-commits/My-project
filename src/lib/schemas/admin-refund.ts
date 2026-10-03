import { z } from "zod";
import { kopecks } from "./common";

// POST /api/admin/orders/[id]/refund (Блок 3, US-008). Одна схема для Dialog возврата (react-hook-form) и сервера.

/**
 * Причина автоматического возврата повторной оплаты (Edge Case 36, A34). Её же проверяет unique-индекс
 * uq_refunds_duplicate_payment (2.20): ручной возврат с этой причиной занял бы «слот» автовозврата платежа
 * и сломал бы защиту от двойного автовозврата. Поэтому в ручном возврате она запрещена (BACKLOG, День 6).
 */
export const RESERVED_REFUND_REASON = "Повторная оплата";
export const RESERVED_REFUND_REASON_MESSAGE = "Эта причина зарезервирована для автоматического возврата";

/** Длина в символах Unicode, как char_length() в CHECK refunds.reason (Zod .min/.max считает UTF-16). */
const codePoints = (v: string) => Array.from(v).length;

// Блок 3 дословно + два уточнения: зарезервированная причина и длина по символам Unicode
// (эмодзи — две единицы UTF-16: «😀😀😀» проходил min(5), но падал на CHECK 5..500 → 500 вместо 400).
export const refundBody = z.object({
  amount: kopecks,
  reason: z.string().trim().min(5, "Минимум 5 символов").max(500)
    .refine((v) => codePoints(v) >= 5, "Минимум 5 символов")
    .refine((v) => v.toLocaleLowerCase("ru-RU") !== RESERVED_REFUND_REASON.toLocaleLowerCase("ru-RU"), RESERVED_REFUND_REASON_MESSAGE),
  restock: z.boolean(),
});
export type RefundBody = z.infer<typeof refundBody>;

/** 200 → { data: AdminRefundResponse }. */
export interface AdminRefundResponse {
  refund_id: string;
  yookassa_refund_id: string | null;
  /** succeeded — деньги возвращены; pending — ЮKassa ещё обрабатывает (итог придёт webhook refund.succeeded). */
  status: "succeeded" | "pending";
  amount_formatted: string;
  order_status: string;
  /** ДОБАВЛЕНО: остаток возвращён на склад этим запросом (BR-17; только при полном возврате, см. отчёт Дня 6). */
  restocked: boolean;
}

/** details 422 REFUND_EXCEEDS_PAID. */
export interface RefundExceedsDetails {
  refundable_amount: number;
}

/** details 502 PAYMENT_PROVIDER_ERROR (null — ЮKassa не ответила: сеть, таймаут, 5xx). */
export interface RefundProviderErrorDetails {
  yookassa_code: string | null;
}
