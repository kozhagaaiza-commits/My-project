// Чистая логика ответа POST /api/orders (Чертёж, Блок 3 + Блок 4 «Оформление заказа» → Error, US-003).
// Без React и без fetch — тестируется node:test.
import { isCheckoutFieldName, type CheckoutFieldName } from "@/lib/checkout-form";
import type {
  CreateOrderResponse, PaymentProviderErrorDetails, PriceChangedDetails,
} from "@/types/orders";

export const NETWORK_MESSAGE = "Нет соединения. Данные формы сохранены";
export const FORBIDDEN_MESSAGE = "Не удалось отправить заказ. Обновите страницу";
export const GENERIC_ERROR_MESSAGE = "Не удалось создать заказ. Повторите попытку";

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
  /** 502: заказ создан и сохранён, оплата — со страницы заказа. */
  | { type: "payment_provider_error"; orderUrl: string; orderNumber: string | null }
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
  return { ok: false, kind: "network" };
}

/** Только http(s): confirmation_url/order_url идут в window.location.assign. */
export function safeNavigationUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
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
export function resolveCreateOrderResult(result: CreateOrderResult): CheckoutOutcome {
  if (!result.ok && result.kind === "network") return { type: "network", message: NETWORK_MESSAGE };

  if (result.ok) {
    const confirmationUrl = safeNavigationUrl(result.data.confirmation_url);
    if (confirmationUrl) return { type: "success", confirmationUrl, orderNumber: result.data.order_number };
    // Заказ создан, но платёжная ссылка непригодна — ведём на страницу заказа (там «Оплатить»).
    const orderUrl = safeNavigationUrl(result.data.order_url);
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
      const orderUrl = isProviderDetails(details) ? safeNavigationUrl(details.order_url) : null;
      return orderUrl
        ? { type: "payment_provider_error", orderUrl, orderNumber: orderNumberFromUrl(orderUrl) }
        : { type: "toast", message };
    }
    default:
      return { type: "toast", message: message || GENERIC_ERROR_MESSAGE };
  }
}
