import "server-only";
import { apiError } from "@/lib/api-error";
import { createAdminClient } from "@/lib/supabase/admin";

// Rate limit (Чертёж, 5.10) через SQL-функцию check_rate_limit (фиксированное окно, таблица rate_limit_hits).
// Функция доступна только service_role — поэтому admin-клиент.

/** Лимиты из таблицы 5.10, которые используются в коде. */
export const RATE_LIMITS = {
  /** GET /api/products, /api/products/[slug], /api/vehicles/* — 120 на IP за 60 с. Ключ `catalog:<ip>`. */
  catalog: { limit: 120, windowSeconds: 60 },
  /** POST /api/cart/validate — 60 на IP за 60 с. Ключ `cart:<ip>`. */
  cart: { limit: 60, windowSeconds: 60 },
  /** POST /api/orders — 5 на IP за 600 с. Ключ `orders:<ip>`. fail-closed (Edge Case 27). */
  orders: { limit: 5, windowSeconds: 600 },
  /** POST /api/orders/[number]/pay — 10 на заказ за 600 с. Ключ `pay:<number>`. fail-closed. */
  pay: { limit: 10, windowSeconds: 600 },
} as const;

/** Текст 3.0 для 429 по умолчанию. */
export const RATE_LIMITED_MESSAGE = "Слишком много запросов. Повторите через минуту";
/** 429 POST /api/orders (Блок 3). */
export const ORDERS_RATE_LIMITED_MESSAGE = "Слишком много попыток оформления. Повторите через 10 минут";

/** Первый адрес из x-forwarded-for (его ставит Vercel), иначе "unknown". */
export function getClientIp(request: Request): string {
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first ? first : "unknown";
}

export interface RateLimitOptions {
  /**
   * true — при ошибке хранилища запрос пропускается (публичное чтение каталога: недоступная таблица лимитов
   * не должна ронять витрину). false — ошибка пробрасывается (→ 500) для чувствительных эндпоинтов.
   */
  failOpen?: boolean;
}

/** true — запрос разрешён, false — лимит превышен. */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number, opts: RateLimitOptions = {}): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc("check_rate_limit", {
      p_key: key, p_limit: limit, p_window_seconds: windowSeconds,
    });
    if (error) throw new Error(`check_rate_limit: ${error.code ?? ""} ${error.message}`);
    if (typeof data !== "boolean") throw new Error("check_rate_limit: unexpected response");
    return data;
  } catch (err) {
    if (!opts.failOpen) throw err;
    console.error({ scope: "rate-limit.check", key, failOpen: true, err });
    return true;
  }
}

/** 429 из 3.0 (или текст эндпоинта из Блока 3) + заголовок Retry-After. */
export function rateLimitedResponse(retryAfterSeconds: number, message: string = RATE_LIMITED_MESSAGE) {
  const res = apiError("RATE_LIMITED", message, 429, { retry_after_seconds: retryAfterSeconds });
  res.headers.set("Retry-After", String(retryAfterSeconds));
  return res;
}

/** Лимит каталога для публичных GET: вернёт готовый 429 или null, если можно продолжать. */
export async function limitCatalog(request: Request) {
  const { limit, windowSeconds } = RATE_LIMITS.catalog;
  const allowed = await checkRateLimit(`catalog:${getClientIp(request)}`, limit, windowSeconds, { failOpen: true });
  return allowed ? null : rateLimitedResponse(windowSeconds);
}

/**
 * Лимит POST /api/cart/validate: вернёт готовый 429 или null. fail-open, как у каталога: проверка корзины —
 * чтение (ничего не бронирует), сбой таблицы лимитов не должен ломать корзину; бронь защищена лимитом POST /api/orders.
 */
export async function limitCart(request: Request) {
  const { limit, windowSeconds } = RATE_LIMITS.cart;
  const allowed = await checkRateLimit(`cart:${getClientIp(request)}`, limit, windowSeconds, { failOpen: true });
  return allowed ? null : rateLimitedResponse(windowSeconds);
}

/**
 * Лимит POST /api/orders (5.10): 5 заказов / 600 с на IP, ключ `orders:<ip>`. fail-CLOSED: при сбое таблицы лимитов
 * checkRateLimit бросает исключение (→ 500), запрос не пропускается — иначе бот держит брони без ограничений (Edge Case 27).
 */
export async function limitOrders(request: Request) {
  const { limit, windowSeconds } = RATE_LIMITS.orders;
  const allowed = await checkRateLimit(`orders:${getClientIp(request)}`, limit, windowSeconds);
  return allowed ? null : rateLimitedResponse(windowSeconds, ORDERS_RATE_LIMITED_MESSAGE);
}

/**
 * Лимит POST /api/orders/[number]/pay (5.10): 10 / 600 с на заказ, ключ `pay:<number>` (номер уже проверен регэкспом).
 * fail-closed, как у заказов: каждый вызов может создать платёж ЮKassa; лимит на заказ ограничивает и перебор токена.
 */
export async function limitPay(orderNumber: string) {
  const { limit, windowSeconds } = RATE_LIMITS.pay;
  const allowed = await checkRateLimit(`pay:${orderNumber}`, limit, windowSeconds);
  return allowed ? null : rateLimitedResponse(windowSeconds);
}
