import type { CartValidateItem, CartValidation } from "@/types/cart";

/** Что нужно блокам «Состав заказа» и кнопке оплаты (производная от ответа validate и состояния отправки). */
export interface CheckoutSummaryState {
  status: "idle" | "loading" | "ready" | "error";
  data: CartValidation | null;
  refreshing: boolean;
  /** Есть позиции с problem (кроме qty_reduced) или can_checkout = false — оплата заблокирована. */
  blocked: boolean;
  /** Ответ validate актуален и проблем нет — можно отправлять. */
  canPay: boolean;
  submitting: boolean;
  retry: () => void;
}

/** problem ≠ null блокирует оформление, кроме qty_reduced (количество уже уменьшено по ответу). */
export const hasBlockingProblem = (items: CartValidateItem[]): boolean =>
  items.some((i) => i.problem !== null && i.problem !== "qty_reduced");
