// Цели Яндекс Метрики (Блок 5.8). Безопасный no-op, если счётчик не задан или не загружен.
// Вызывать только из клиентского кода (обработчики событий, эффекты).

export type MetrikaGoal =
  | "fitment_selected"
  | "product_view"
  | "add_to_cart"
  | "checkout_started"
  | "payment_succeeded"
  | "telegram_subscribed"
  | "atelier_applied";

declare global {
  interface Window {
    ym?: (counterId: number, method: string, goal: string) => void;
  }
}

export function reachGoal(goal: MetrikaGoal): void {
  try {
    if (typeof window === "undefined") return;
    const counterId = Number(process.env.NEXT_PUBLIC_YM_COUNTER_ID);
    if (!Number.isInteger(counterId) || counterId <= 0) return;
    if (typeof window.ym !== "function") return;
    window.ym(counterId, "reachGoal", goal);
  } catch {
    // Метрика не должна ломать интерфейс.
  }
}
