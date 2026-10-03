// Чистая логика опроса статуса заказа после возврата с ЮKassa (Блок 4 «Статус заказа», BR-12).
// Возврат на return_url статус НЕ меняет — оплату подтверждает только webhook/сверка на сервере,
// страница лишь периодически перечитывает заказ. Без React и fetch — тестируется node:test.
import type { OrderStatus } from "@/types/order-view";

export const POLL_INTERVAL_MS = 3_000;
export const POLL_WINDOW_MS = 60_000;
/** Подряд неудачных опросов, после которых показывается «Не удалось обновить статус». */
export const MAX_POLL_FAILURES = 3;
export const POLL_FAILED_MESSAGE = "Не удалось обновить статус. Обновите страницу";

/** Фазы блока оплаты: идёт опрос / оплата не поступила (или опроса не было) / опрос не удался. */
export type PollPhase = "checking" | "unpaid" | "failed";

/** Опрос нужен только после возврата с ЮKassa (?from=payment) и пока заказ ждёт оплаты. */
export function shouldPoll(fromPayment: boolean, status: OrderStatus): boolean {
  return fromPayment && status === "pending_payment";
}

export interface PollProgress {
  failures: number;
}

export type PollResult = { ok: true; status: OrderStatus } | { ok: false };

export type PollStep =
  /** Статус сменился — остановить опрос, показать новое состояние. */
  | { kind: "changed" }
  /** Продолжать: следующий опрос через POLL_INTERVAL_MS. */
  | { kind: "continue"; progress: PollProgress }
  /** 60 с прошли, оплата не поступила. */
  | { kind: "timeout" }
  /** 3 неудачи подряд — остановить, показать inline-сообщение. */
  | { kind: "failed" };

/** Результат одного опроса → что делать дальше. elapsedMs — время с начала опроса. */
export function nextPollStep(
  progress: PollProgress, result: PollResult, elapsedMs: number, currentStatus: OrderStatus = "pending_payment",
): PollStep {
  if (result.ok) {
    if (result.status !== currentStatus) return { kind: "changed" };
    if (elapsedMs >= POLL_WINDOW_MS) return { kind: "timeout" };
    return { kind: "continue", progress: { failures: 0 } };
  }
  const failures = progress.failures + 1;
  if (failures >= MAX_POLL_FAILURES) return { kind: "failed" };
  // Тихий повтор; окно опроса истекло — заканчиваем без сообщения об ошибке.
  if (elapsedMs >= POLL_WINDOW_MS) return { kind: "timeout" };
  return { kind: "continue", progress: { failures } };
}

const PAID_OR_LATER: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "paid", "confirmed", "ordered_from_supplier", "in_transit", "arrived", "shipped", "delivered",
]);

export const isPaidStatus = (status: OrderStatus): boolean => PAID_OR_LATER.has(status);

/**
 * Цель Метрики payment_succeeded: покупатель вернулся с ЮKassa и заказ оплачен — либо статус сменился
 * с pending_payment при опросе, либо заказ уже был оплачен в момент открытия страницы.
 * previous = null — первое состояние страницы (открытие).
 */
export function shouldReachPaymentGoal(fromPayment: boolean, previous: OrderStatus | null, status: OrderStatus): boolean {
  if (!isPaidStatus(status)) return false;
  if (previous === null) return fromPayment;
  return previous === "pending_payment";
}

export const paymentGoalFlagKey = (number: string): string => `fc_goal_payment_${number}`;
