// Клиент POST /api/cart/validate (Чертёж, Блок 3). Только для браузера; fetch можно подменить в тестах.
import type { CartRequestItem, CartValidation } from "@/types/cart";

export const VALIDATE_TIMEOUT_MS = 10_000;
export const CART_CHECK_FAILED = "Не удалось проверить наличие";

export type ValidateResult =
  | { ok: true; data: CartValidation }
  /** Сеть/таймаут/нечитаемый ответ → состояние «Не удалось проверить наличие. Повторить». */
  | { ok: false; kind: "network" }
  /** Ответ { error: { code, message } } — message показываем как есть (toast). */
  | { ok: false; kind: "api"; status: number; code: string; message: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function isValidation(v: unknown): v is CartValidation {
  return isRecord(v) && Array.isArray(v.items) && typeof v.total === "number" && typeof v.can_checkout === "boolean";
}

export async function validateCart(
  items: CartRequestItem[],
  options: { signal?: AbortSignal; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<ValidateResult> {
  const { signal, fetchImpl = (input, init) => fetch(input, init), timeoutMs = VALIDATE_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl("/api/cart/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })) }),
      signal: controller.signal,
    });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, kind: "network" };
    }
    if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string") {
      const code = typeof body.error.code === "string" ? body.error.code : "ERROR";
      return { ok: false, kind: "api", status: res.status, code, message: body.error.message };
    }
    if (res.ok && isRecord(body) && isValidation(body.data)) return { ok: true, data: body.data };
    return { ok: false, kind: "network" };
  } catch {
    return { ok: false, kind: "network" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
