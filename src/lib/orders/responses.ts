import "server-only";
import type { z } from "zod";
import { apiError } from "@/lib/api-error";
import { formatRub } from "@/lib/money";
import type { PriceChangedDetails } from "@/types/orders";
import type { ProductType } from "@/types/catalog";

// Ответы-ошибки заказов: коды, HTTP-статусы и тексты — дословно из Блока 3 (POST /api/orders, /pay, GET заказа).

export const orderNotFound = () => apiError("NOT_FOUND", "Заказ не найден", 404);
export const orderNotPayable = () => apiError("ORDER_NOT_PAYABLE", "Время на оплату истекло. Оформите заказ заново", 409);

/**
 * details.fields для 400: как z.flattenError(err).fieldErrors, но ключ — полный путь через точку
 * (`customer.phone`, `delivery.address`, `items.0.quantity`), как в примере Блока 3. Корневые ошибки
 * (тело не объект, битый JSON) в fields не попадают — тогда fields = {}.
 */
export function fieldErrorsByPath(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    if (issue.path.length === 0) continue;
    const key = issue.path.map((p) => String(p)).join(".");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export const VALIDATION_MESSAGE = "Проверьте поля формы";

export function orderValidationError(fields: Record<string, string[]>, message: string = VALIDATION_MESSAGE) {
  return apiError("VALIDATION_ERROR", message, 400, { fields });
}

/** BR-18: не больше 3 неоплаченных заказов с действующей бронью на один email. */
export const MAX_PENDING_ORDERS_PER_EMAIL = 3;
/** Бронь — 30 минут (RESERVATION_MINUTES): через столько освободится место для нового заказа. */
export const PENDING_ORDERS_RETRY_AFTER_SECONDS = 1800;

export function tooManyPendingOrders() {
  const res = apiError(
    "RATE_LIMITED", "У вас уже есть неоплаченные заказы. Оплатите или дождитесь отмены через 30 минут", 429,
    { retry_after_seconds: PENDING_ORDERS_RETRY_AFTER_SECONDS },
  );
  res.headers.set("Retry-After", String(PENDING_ORDERS_RETRY_AFTER_SECONDS));
  return res;
}

export function priceChanged(expectedTotal: number, actualTotal: number) {
  const details: PriceChangedDetails = {
    expected_total: expectedTotal, actual_total: actualTotal, actual_total_formatted: formatRub(actualTotal),
  };
  return apiError("PRICE_CHANGED", "Цены изменились", 409, details);
}

export const outOfStock = (productId: string, availableQty: number) =>
  apiError("OUT_OF_STOCK", "Комплект закончился", 409, { product_id: productId, available_qty: Math.max(availableQty, 0) });

export const mixedKinds = () => apiError("MIXED_KINDS", "Товары под заказ оформляются отдельным заказом", 409);

/** BR-04: текст для дисков — дословно Блок 3; для карбона — по формулировке BR-04 (4 штуки одной детали). */
export const qtyLimit = (productId: string, type: ProductType | null) => apiError(
  "QTY_LIMIT",
  type === "carbon_part" ? "Не больше 4 штук одной карбоновой детали в заказе" : "Не больше 2 комплектов одного диска в заказе",
  409, { product_id: productId },
);

export const productUnavailable = (productId: string) =>
  apiError("PRODUCT_UNAVAILABLE", "Товар больше не продаётся", 410, { product_id: productId });

/** 502 POST /api/orders: заказ сохранён в pending_payment, оплатить можно со страницы заказа. */
export const orderPaymentProviderError = (orderUrl: string) => apiError(
  "PAYMENT_PROVIDER_ERROR", "Платёжный сервис временно недоступен. Заказ сохранён — оплатите его со страницы заказа", 502,
  { order_url: orderUrl },
);

/** 502 POST /api/orders/[number]/pay. */
export const payPaymentProviderError = () =>
  apiError("PAYMENT_PROVIDER_ERROR", "Платёжный сервис временно недоступен. Повторите через минуту", 502);
