// Клиент POST /api/orders (Чертёж, Блок 3). Только для браузера; fetch можно подменить в тестах.
// Same-origin, cookies по умолчанию (сессия нужна серверу для привязки заказа и цен ателье).
import { parseCreateOrderResponse, type CreateOrderResult } from "@/lib/checkout-response";
import type { CreateOrderBody } from "@/lib/schemas/orders";

// Сервер ждёт ЮKassa до ~25 с (3 попытки) + запас.
export const CREATE_ORDER_TIMEOUT_MS = 60_000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Сеть, таймаут и нечитаемый ответ → { kind: "network" }; { error } и 201 разбираются по Блоку 3. */
export async function createOrder(
  payload: CreateOrderBody,
  options: { signal?: AbortSignal; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<CreateOrderResult> {
  const { signal, fetchImpl = (input, init) => fetch(input, init), timeoutMs = CREATE_ORDER_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // не JSON: 5xx разберёт parseCreateOrderResponse как «сервис недоступен», прочее — как network
    }
    return parseCreateOrderResponse(res.status, body);
  } catch {
    return { ok: false, kind: "network" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
