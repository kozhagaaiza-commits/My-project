// Яндекс Метрика (Блок 5.8 «Цели», 5.11 п.5; BACKLOG «Метрика и токен заказа»). Только клиентский код.
// Всё — безопасный no-op, если счётчик не задан (NEXT_PUBLIC_YM_COUNTER_ID пуст) или скрипт не загружен.
//
// Приватность: ссылка заказа содержит секретный `?t=<token>` (A28), поэтому счётчик инициализируется с `defer: true` (автоматический
// хит не отправляется), а хиты шлёт компонент MetrikaScript вручную: ym(id, 'hit', location.pathname) — путь без query и hash.
// Вебвизор выключен (персональные данные в формах), карта кликов выключена.

export const METRIKA_SCRIPT_URL = "https://mc.yandex.ru/metrika/tag.js";

export type MetrikaGoal =
  | "fitment_selected"
  | "product_view"
  | "add_to_cart"
  | "checkout_started"
  | "payment_succeeded"
  | "telegram_subscribed"
  | "atelier_applied";

/** Все цели Блока 5.8 (для проверки списка в тестах и чек-листа настройки счётчика). */
export const METRIKA_GOALS: readonly MetrikaGoal[] = [
  "fitment_selected", "product_view", "add_to_cart", "checkout_started", "payment_succeeded", "telegram_subscribed", "atelier_applied",
];

/** Параметры init: defer (без автохита), вебвизор и карта кликов выключены. */
export const METRIKA_INIT_OPTIONS = {
  defer: true,
  webvisor: false,
  clickmap: false,
  trackLinks: true,
  accurateTrackBounce: true,
} as const;

type YmFunction = ((counterId: number, method: string, ...args: unknown[]) => void) & { a?: unknown[]; l?: number };

declare global {
  interface Window {
    ym?: YmFunction;
  }
}

/** Номер счётчика или null (переменная пуста / не положительное целое). */
export function metrikaCounterId(raw: string | undefined = process.env.NEXT_PUBLIC_YM_COUNTER_ID): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Метрика не грузится в админке (/admin и вложенные пути). */
export function isMetrikaPath(pathname: string): boolean {
  return pathname !== "/admin" && !pathname.startsWith("/admin/");
}

/** Очередь вызовов до загрузки tag.js: как в штатном сниппете, tag.js разбирает `ym.a` по порядку (init → hit → цели). */
export function ensureYmQueue(): void {
  if (typeof window === "undefined" || typeof window.ym === "function") return;
  const queue: YmFunction = (...args) => {
    (queue.a ??= []).push(args);
  };
  queue.l = Date.now();
  window.ym = queue;
}

/** Инициализация счётчика без автоматического хита (defer: true). */
export function initMetrika(counterId: number): void {
  try {
    ensureYmQueue();
    window.ym?.(counterId, "init", { ...METRIKA_INIT_OPTIONS });
  } catch {
    // Метрика не должна ломать интерфейс.
  }
}

/** Ручной хит страницы: только путь, без query (в ссылке заказа лежит секретный токен `?t=`). */
export function trackHit(pathname: string, counterId: number | null = metrikaCounterId()): void {
  try {
    if (counterId === null || typeof window === "undefined" || typeof window.ym !== "function") return;
    window.ym(counterId, "hit", pathname.split(/[?#]/)[0]);
  } catch {
    // см. выше
  }
}

export function reachGoal(goal: MetrikaGoal): void {
  try {
    if (typeof window === "undefined") return;
    const counterId = metrikaCounterId();
    if (counterId === null || typeof window.ym !== "function") return;
    window.ym(counterId, "reachGoal", goal);
  } catch {
    // Метрика не должна ломать интерфейс.
  }
}
