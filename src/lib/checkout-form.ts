// Форма оформления заказа (Чертёж, Блок 4 «Оформление заказа», Блок 5.1): значения формы ↔ createOrderBody.
// Чистая логика без React и window — тестируется node:test.
// Единая схема клиента и сервера — createOrderBody (src/lib/schemas/orders.ts); здесь только приведение
// значений формы к её входу и русские тексты для ошибок, у которых в схеме нет собственного сообщения (5.1).
import type { FieldErrors, Resolver, ResolverOptions } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { createOrderBody, type CreateOrderBody } from "@/lib/schemas/orders";
import type { CartRequestItem } from "@/types/cart";

export type DeliveryMethod = "moscow_courier" | "cdek_pvz" | "cdek_door";

export const DELIVERY_METHODS: readonly DeliveryMethod[] = ["moscow_courier", "cdek_pvz", "cdek_door"];

export interface CheckoutFormValues {
  customer: { name: string; phone: string; email: string };
  /** method "" — способ ещё не выбран (ошибка «Выберите способ доставки»). Остальные поля всегда строки. */
  delivery: { method: DeliveryMethod | ""; city: string; address: string; postal_code: string; cdek_pvz_code: string };
  vin: string;
  comment: string;
  consent_pd: boolean;
  consent_offer: boolean;
}

export const EMPTY_CHECKOUT_VALUES: CheckoutFormValues = {
  customer: { name: "", phone: "", email: "" },
  delivery: { method: "", city: "", address: "", postal_code: "", cdek_pvz_code: "" },
  vin: "",
  comment: "",
  consent_pd: false,
  consent_offer: false,
};

/** Имена полей формы, у которых есть место под сообщение (ключи details.fields сервера → setError). */
export const CHECKOUT_FIELD_NAMES = [
  "customer.name", "customer.phone", "customer.email",
  "delivery.method", "delivery.city", "delivery.address", "delivery.postal_code", "delivery.cdek_pvz_code",
  "vin", "comment", "consent_pd", "consent_offer",
] as const;

export type CheckoutFieldName = (typeof CHECKOUT_FIELD_NAMES)[number];

export const isCheckoutFieldName = (v: string): v is CheckoutFieldName =>
  (CHECKOUT_FIELD_NAMES as readonly string[]).includes(v);

export const COURIER_CITY = "Москва";
export const COMMENT_MAX = 1000;

/** То, чего нет в полях формы, но нужно схеме: id попытки, позиции, ожидаемая сумма, авто. */
export interface OrderMeta {
  requestId: string;
  items: CartRequestItem[];
  /** total из последнего ответа validate; null, пока ответа нет. */
  expectedTotal: number | null;
  vehicleId: string | null;
}

const orNull = (v: string): string | null => (v.trim() === "" ? null : v);

function buildDelivery(d: CheckoutFormValues["delivery"]): Record<string, unknown> {
  switch (d.method) {
    case "moscow_courier":
      return { method: d.method, city: COURIER_CITY, address: d.address, postal_code: orNull(d.postal_code), cdek_pvz_code: null };
    case "cdek_pvz":
      return { method: d.method, city: d.city, cdek_pvz_code: d.cdek_pvz_code, address: null, postal_code: null };
    case "cdek_door":
      return { method: d.method, city: d.city, address: d.address, postal_code: d.postal_code, cdek_pvz_code: null };
    default:
      return { method: d.method };
  }
}

/**
 * Значения формы → вход createOrderBody: лишние поля доставки — null, необязательные пустые — null.
 * Телефон остаётся как в маске («+7 (916) 555-12-34») — phoneRu нормализует его до +79165551234 при разборе.
 */
export function buildOrderInput(values: CheckoutFormValues, meta: OrderMeta): Record<string, unknown> {
  return {
    client_request_id: meta.requestId,
    items: meta.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    expected_total: meta.expectedTotal ?? undefined,
    customer: { ...values.customer },
    delivery: buildDelivery(values.delivery),
    vehicle_id: meta.vehicleId,
    vin: orNull(values.vin),
    comment: orNull(values.comment),
    consent_pd: values.consent_pd,
    consent_offer: values.consent_offer,
  };
}

/** Тексты 5.1 для ошибок, где в схеме нет своего сообщения (сообщения схемы имеют приоритет). */
export function checkoutErrorMap(issue: { code: string; path?: PropertyKey[] }): string | undefined {
  const [group, field] = issue.path ?? [];
  const tooBig = issue.code === "too_big";
  if (group === "delivery" && field === "method") return "Выберите способ доставки";
  if (group === "delivery" && field === "city") return "Укажите город";
  if (group === "delivery" && field === "address") return tooBig ? "Не больше 300 символов" : "Укажите улицу, дом и квартиру";
  if (group === "delivery" && field === "postal_code") return "Индекс — 6 цифр";
  if (group === "comment" && tooBig) return "Не больше 1000 символов";
  if (group === "customer" && field === "name" && tooBig) return "Не больше 100 символов";
  if (group === "customer" && field === "email") return "Проверьте email";
  return undefined;
}

type SchemaInput = z.input<typeof createOrderBody>;

/**
 * zodResolver(createOrderBody) поверх значений формы: форма отдаёт строки, схема ждёт null и число/uuid —
 * resolver сначала приводит значения (buildOrderInput), затем разбирает той же схемой, что и сервер.
 * Результат — готовое тело запроса (phone → +7XXXXXXXXXX, vin/ПВЗ → верхний регистр, trim).
 * getMeta вызывается при каждой проверке (в момент отправки/повторной проверки поля).
 */
export function makeCheckoutResolver(getMeta: () => OrderMeta): Resolver<CheckoutFormValues, unknown, CreateOrderBody> {
  const base = zodResolver(createOrderBody, { error: checkoutErrorMap });
  return async (values, context, options) => {
    const result = await base(
      buildOrderInput(values, getMeta()) as unknown as SchemaInput,
      context,
      options as unknown as ResolverOptions<SchemaInput>,
    );
    if (Object.keys(result.errors).length === 0) return { values: result.values as CreateOrderBody, errors: {} };
    return { values: {}, errors: result.errors as unknown as FieldErrors<CheckoutFormValues> };
  };
}
