// Чистая логика ответа POST /api/orders (Чертёж, Блок 3 + Блок 4 «Оформление заказа» → Error, US-003).
// Без React и без fetch — тестируется node:test.
import { isCheckoutFieldName, type CheckoutFieldName } from "@/lib/checkout-form";
import type {
  CreateOrderResponse, PaymentProviderErrorDetails, PriceChangedDetails,
} from "@/types/orders";

export const NETWORK_MESSAGE = "Нет соединения. Данные формы сохранены";
export const FORBIDDEN_MESSAGE = "Не удалось отправить заказ. Обновите страницу";
export const GENERIC_ERROR_MESSAGE = "Не удалось создать заказ. Повторите попытку";
export const SERVICE_UNAVAILABLE_MESSAGE = "Сервис временно недоступен, попробуйте через несколько минут";
export const ORDER_EXPIRED_MESSAGE = "Время на оплату истекло. Оформите заказ заново";

export type CreateOrderResult =
  | { ok: true; data: CreateOrderResponse }
  /** Сеть/таймаут/нечитаемый ответ: заказ мог успеть создаться — повтор уходит с тем же client_request_id. */
  | { ok: false; kind: "network" }
  | { ok: false; kind: "api"; status: number; code: string; message: string; details: unknown };

export interface FieldIssue {
  name: CheckoutFieldName;
  message: string;
}

/** Что делает интерфейс по ответу сервера. */
export type CheckoutOutcome =
  | { type: "success"; confirmationUrl: string; orderNumber: string }
  /** 400: ошибки раскладываются по полям; fallbackMessage (если есть) — toast для ключей, которых нет в форме. */
  | { type: "field_errors"; errors: FieldIssue[]; fallbackMessage: string | null }
  | { type: "price_changed"; expectedTotal: number; actualTotal: number; actualFormatted: string }
  /** toast + redirect /cart (OUT_OF_STOCK, PRODUCT_UNAVAILABLE, MIXED_KINDS, QTY_LIMIT). */
  | { type: "cart_problem"; message: string }
  | { type: "toast"; message: string }
  /** 502: заказ создан и сохранён, оплата — со страницы заказа. orderUrl null — ссылка не прошла проверку (только текст). */
  | { type: "payment_provider_error"; orderUrl: string | null; orderNumber: string | null }
  /**
   * ORDER_NOT_PAYABLE / CONFLICT: прежний client_request_id больше не годится (заказ отменён/истёк либо повтор
   * с другими данными) — id сбрасывается, toast, повторная попытка сразу доступна (уйдёт с новым id).
   */
  | { type: "new_attempt"; message: string }
  | { type: "network"; message: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isCreateOrderResponse(v: unknown): v is CreateOrderResponse {
  return isRecord(v)
    && typeof v.order_id === "string" && typeof v.order_number === "string"
    && typeof v.total === "number" && typeof v.total_formatted === "string"
    && typeof v.reserved_until === "string"
    && typeof v.confirmation_url === "string" && typeof v.order_url === "string";
}

/** Тело ответа + HTTP-статус → типизированный результат. Не JSON / неизвестная форма → network. */
export function parseCreateOrderResponse(status: number, body: unknown): CreateOrderResult {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string") {
    const code = typeof body.error.code === "string" ? body.error.code : "ERROR";
    return { ok: false, kind: "api", status, code, message: body.error.message, details: body.error.details };
  }
  if (status >= 200 && status < 300 && isRecord(body) && isCreateOrderResponse(body.data)) {
    return { ok: true, data: body.data };
  }
  // 5xx без разбираемого { error } (HTML шлюза, пустое тело): сервис недоступен, а не «нет сети».
  if (status >= 500) return { ok: false, kind: "api", status, code: "SERVER_ERROR", message: "", details: undefined };
  return { ok: false, kind: "network" };
}

/** Окружение проверки ссылок перехода: production и origin текущей страницы (null — неизвестен). */
export interface NavigationEnv {
  production: boolean;
  origin: string | null;
}

export function currentNavigationEnv(): NavigationEnv {
  return {
    production: process.env.NODE_ENV === "production",
    origin: typeof window === "undefined" ? null : window.location.origin,
  };
}

/**
 * Ссылка для window.location.assign. В production только https:, в dev/тестах — http(s). javascript:/data:,
 * ссылки с логином/паролем и нечитаемые отбрасываются. Хост-allowlist для платёжной страницы не вводится
 * (домены ЮKassa могут меняться). sameOrigin = true — дополнительно origin должен совпасть с текущим сайтом.
 */
export function safeNavigationUrl(
  url: unknown, options: { env?: NavigationEnv; sameOrigin?: boolean } = {},
): string | null {
  if (typeof url !== "string") return null;
  const env = options.env ?? currentNavigationEnv();
  try {
    const parsed = new URL(url);
    const allowed = env.production ? parsed.protocol === "https:" : parsed.protocol === "https:" || parsed.protocol === "http:";
    if (!allowed || parsed.username || parsed.password) return null;
    if (options.sameOrigin && (env.origin === null || parsed.origin !== env.origin)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/** FC-26-000123 из ссылки /orders/FC-26-000123?t=… (в details 502 номера нет, только order_url). */
export function orderNumberFromUrl(url: string): string | null {
  return /\/orders\/(FC-\d{2}-\d{6})(?:[/?#]|$)/.exec(url)?.[1] ?? null;
}

/** details.fields: { "customer.phone": ["…"] } → ошибки полей формы + сообщение для ключей вне формы. */
export function splitFieldErrors(details: unknown, message: string): { errors: FieldIssue[]; fallbackMessage: string | null } {
  const fields = isRecord(details) && isRecord(details.fields) ? details.fields : {};
  const errors: FieldIssue[] = [];
  let unmapped: string | null = null;
  for (const [key, value] of Object.entries(fields)) {
    const first = Array.isArray(value) ? value.find((m): m is string => typeof m === "string") : undefined;
    if (!first) continue;
    if (isCheckoutFieldName(key)) errors.push({ name: key, message: first });
    else unmapped ??= first;
  }
  return { errors, fallbackMessage: errors.length === 0 ? message : unmapped };
}

function isPriceChanged(d: unknown): d is PriceChangedDetails {
  return isRecord(d) && typeof d.expected_total === "number" && typeof d.actual_total === "number"
    && typeof d.actual_total_formatted === "string";
}

const isProviderDetails = (d: unknown): d is PaymentProviderErrorDetails => isRecord(d) && typeof d.order_url === "string";

/** Маппинг результата POST /api/orders на действие UI — все коды Блока 3. */
export function resolveCreateOrderResult(
  result: CreateOrderResult, env: NavigationEnv = currentNavigationEnv(),
): CheckoutOutcome {
  if (!result.ok && result.kind === "network") return { type: "network", message: NETWORK_MESSAGE };
  // order_url — страница нашего сайта: чужой origin не открываем.
  const ownOrderUrl = (url: unknown) => safeNavigationUrl(url, { env, sameOrigin: true });

  if (result.ok) {
    const confirmationUrl = safeNavigationUrl(result.data.confirmation_url, { env });
    if (confirmationUrl) return { type: "success", confirmationUrl, orderNumber: result.data.order_number };
    // Заказ создан, но платёжная ссылка непригодна — ведём на страницу заказа (там «Оплатить»).
    const orderUrl = ownOrderUrl(result.data.order_url);
    return orderUrl
      ? { type: "payment_provider_error", orderUrl, orderNumber: result.data.order_number }
      : { type: "toast", message: GENERIC_ERROR_MESSAGE };
  }

  const { status, code, message, details } = result;
  if (status === 403 || code === "FORBIDDEN") return { type: "toast", message: FORBIDDEN_MESSAGE };
  switch (code) {
    case "VALIDATION_ERROR":
      return { type: "field_errors", ...splitFieldErrors(details, message) };
    case "PRICE_CHANGED":
      return isPriceChanged(details)
        ? {
            type: "price_changed", expectedTotal: details.expected_total,
            actualTotal: details.actual_total, actualFormatted: details.actual_total_formatted,
          }
        : { type: "toast", message };
    case "OUT_OF_STOCK":
    case "PRODUCT_UNAVAILABLE":
    case "MIXED_KINDS":
    case "QTY_LIMIT":
      return { type: "cart_problem", message };
    case "RATE_LIMITED":
      return { type: "toast", message };
    case "PAYMENT_PROVIDER_ERROR": {
      if (!isProviderDetails(details)) return { type: "toast", message };
      // Заказ создан даже при непригодной ссылке: показываем текст диалога, но никуда не ведём.
      const orderUrl = ownOrderUrl(details.order_url);
      return {
        type: "payment_provider_error", orderUrl,
        orderNumber: orderNumberFromUrl(orderUrl ?? details.order_url),
      };
    }
    case "ORDER_NOT_PAYABLE":
      return { type: "new_attempt", message: ORDER_EXPIRED_MESSAGE };
    case "CONFLICT":
      return { type: "new_attempt", message: message || GENERIC_ERROR_MESSAGE };
    default:
      if (status >= 500) return { type: "toast", message: SERVICE_UNAVAILABLE_MESSAGE };
      return { type: "toast", message: message || GENERIC_ERROR_MESSAGE };
  }
}
