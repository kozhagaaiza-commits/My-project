// Клиент GET /api/orders/[number]?t= и POST /api/orders/[number]/pay?t= (Чертёж, Блок 3). Только для браузера;
// fetch можно подменить в тестах. Ответ разбирается без доверия к форме: чужая/битая структура → ошибка.
import { retryAfterDelayMs } from "@/lib/order-page-poll";
import { safeNavigationUrl, type NavigationEnv } from "@/lib/checkout-response";
import type { OrderView } from "@/types/order-view";

export const ORDER_FETCH_TIMEOUT_MS = 10_000;
export const PAY_TIMEOUT_MS = 30_000;
export const ORDER_NOT_PAYABLE_MESSAGE = "Время на оплату истекло. Оформите заказ заново";
export const PAYMENT_UNAVAILABLE_MESSAGE = "Платёжный сервис временно недоступен. Повторите через минуту";
export const PAY_NETWORK_MESSAGE = "Нет соединения. Повторите попытку";
export const PAY_FORBIDDEN_MESSAGE = "Не удалось выполнить запрос. Обновите страницу";
export const PAY_NOT_FOUND_MESSAGE = "Заказ не найден";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Минимальная проверка формы OrderView: поля, без которых страница не отрисуется. */
export function isOrderView(v: unknown): v is OrderView {
  return (
    isRecord(v) && typeof v.number === "string" && typeof v.status === "string" && typeof v.status_label === "string" &&
    typeof v.kind === "string" && Array.isArray(v.timeline) && Array.isArray(v.items) &&
    typeof v.total_formatted === "string" && isRecord(v.delivery) && isRecord(v.customer)
  );
}

export const orderUrl = (number: string, token: string | null, path = ""): string =>
  `/api/orders/${encodeURIComponent(number)}${path}${token ? `?t=${encodeURIComponent(token)}` : ""}`;

export type FetchOrderResult =
  | { ok: true; view: OrderView }
  | { ok: false; rateLimited?: false }
  /** 429: лимит запросов — не сбой; retryAfterMs из Retry-After (5 с по умолчанию, максимум 15 с). */
  | { ok: false; rateLimited: true; retryAfterMs: number };

async function withTimeout<T>(
  timeoutMs: number, signal: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Опрос: сеть, не-2xx, нечитаемый ответ → { ok: false }; 429 → { ok: false, rateLimited, retryAfterMs }. */
export async function fetchOrderView(
  number: string, token: string | null,
  options: { signal?: AbortSignal; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<FetchOrderResult> {
  const { signal, fetchImpl = (input, init) => fetch(input, init), timeoutMs = ORDER_FETCH_TIMEOUT_MS } = options;
  try {
    return await withTimeout(timeoutMs, signal, async (s) => {
      const res = await fetchImpl(orderUrl(number, token), { cache: "no-store", signal: s });
      if (res.status === 429) {
        return { ok: false, rateLimited: true, retryAfterMs: retryAfterDelayMs(res.headers.get("Retry-After")) } as const;
      }
      if (!res.ok) return { ok: false } as const;
      const body: unknown = await res.json();
      return isRecord(body) && isOrderView(body.data) ? ({ ok: true, view: body.data } as const) : ({ ok: false } as const);
    });
  } catch {
    return { ok: false };
  }
}

export type PayOutcome =
  | { type: "redirect"; url: string }
  /** 409 ORDER_NOT_PAYABLE: бронь истекла — заказ отменён. */
  | { type: "expired"; message: string }
  | { type: "toast"; message: string };

/** Ответ POST /pay → действие интерфейса (Блок 3: 200 / 404 / 409 / 429 / 502). */
export function resolvePayResponse(status: number, body: unknown, env?: NavigationEnv): PayOutcome {
  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message : "";
  if (status >= 200 && status < 300 && isRecord(body) && isRecord(body.data)) {
    const url = safeNavigationUrl(body.data.confirmation_url, { env });
    return url ? { type: "redirect", url } : { type: "toast", message: PAYMENT_UNAVAILABLE_MESSAGE };
  }
  if (status === 409 && code === "ORDER_NOT_PAYABLE") return { type: "expired", message: message || ORDER_NOT_PAYABLE_MESSAGE };
  if (status === 404) return { type: "toast", message: PAY_NOT_FOUND_MESSAGE };
  if (status === 403) return { type: "toast", message: PAY_FORBIDDEN_MESSAGE };
  if (status === 429 && message) return { type: "toast", message };
  return { type: "toast", message: PAYMENT_UNAVAILABLE_MESSAGE };
}

/** «Оплатить»: Origin браузер добавляет сам (same-origin POST). Сеть/таймаут → toast. */
export async function requestPay(
  number: string, token: string | null,
  options: { fetchImpl?: FetchLike; timeoutMs?: number; env?: NavigationEnv } = {},
): Promise<PayOutcome> {
  const { fetchImpl = (input, init) => fetch(input, init), timeoutMs = PAY_TIMEOUT_MS, env } = options;
  try {
    return await withTimeout(timeoutMs, undefined, async (signal) => {
      const res = await fetchImpl(orderUrl(number, token, "/pay"), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal,
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // не JSON — разберётся по статусу
      }
      return resolvePayResponse(res.status, body, env);
    });
  } catch {
    return { type: "toast", message: PAY_NETWORK_MESSAGE };
  }
}
