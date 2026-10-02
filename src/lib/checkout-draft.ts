// Черновик формы (sessionStorage.fc_checkout_draft) и client_request_id попытки оформления
// (Блок 4 «Оформление заказа», Edge Case 1/17). Все обращения к sessionStorage — в try/catch.
// Чистые функции (parse/resolve) без window — тестируются node:test; браузерные обёртки — ниже.
import { uuid } from "@/lib/schemas/common";
import { DELIVERY_METHODS, EMPTY_CHECKOUT_VALUES, type CheckoutFormValues, type DeliveryMethod } from "@/lib/checkout-form";

export const DRAFT_KEY = "fc_checkout_draft";
export const REQUEST_ID_KEY = "fc_checkout_request";

/** Черновик — значения формы БЕЗ согласий (их нужно давать заново). */
export type CheckoutDraft = Omit<CheckoutFormValues, "consent_pd" | "consent_offer">;

export function draftFromValues(values: CheckoutFormValues): CheckoutDraft {
  return { customer: values.customer, delivery: values.delivery, vin: values.vin, comment: values.comment };
}

export const serializeDraft = (values: CheckoutFormValues): string => JSON.stringify(draftFromValues(values));

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * Значения формы из сохранённого черновика поверх пустых. Повреждённый/чужой JSON → пустая форма (Edge Case 17);
 * неизвестные ключи отбрасываются, согласия всегда false.
 */
export function restoreValues(raw: string | null): CheckoutFormValues {
  if (!raw) return EMPTY_CHECKOUT_VALUES;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return EMPTY_CHECKOUT_VALUES;
  }
  if (!isRecord(value)) return EMPTY_CHECKOUT_VALUES;
  const customer = isRecord(value.customer) ? value.customer : {};
  const delivery = isRecord(value.delivery) ? value.delivery : {};
  const method = DELIVERY_METHODS.find((m) => m === delivery.method) as DeliveryMethod | undefined;
  return {
    customer: { name: text(customer.name, 100), phone: text(customer.phone, 30), email: text(customer.email, 254) },
    delivery: {
      method: method ?? "",
      city: text(delivery.city, 80),
      address: text(delivery.address, 300),
      postal_code: text(delivery.postal_code, 6),
      cdek_pvz_code: text(delivery.cdek_pvz_code, 20),
    },
    vin: text(value.vin, 17),
    comment: text(value.comment, 1000),
    consent_pd: false,
    consent_offer: false,
  };
}

/** Ключ состава корзины: смена id/количества → новая попытка → новый client_request_id. */
export const requestCartKey = (items: Array<{ product_id: string; quantity: number }>): string =>
  items.map((i) => `${i.product_id}:${i.quantity}`).join(",");

interface StoredRequest {
  id: string;
  cart_key: string;
}

/**
 * client_request_id попытки: пока состав корзины тот же — возвращается прежний id (повтор после сетевой ошибки,
 * после PRICE_CHANGED), иначе — новый. changed = true, если id нужно (пере)записать в хранилище.
 */
export function resolveRequestId(
  raw: string | null, cartKey: string, generate: () => string,
): { id: string; changed: boolean } {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (isRecord(value) && typeof value.id === "string" && uuid.safeParse(value.id).success && value.cart_key === cartKey) {
      return { id: value.id, changed: false };
    }
  } catch {
    // повреждённое значение — новая попытка
  }
  return { id: generate(), changed: true };
}

/** UUID v4; crypto.randomUUID есть только в защищённом контексте (https/localhost), поэтому есть запасной путь. */
export function generateUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// --- браузерные обёртки (sessionStorage недоступен → черновик не сохраняется, id живёт в памяти вкладки) ---

let memoryRequest: StoredRequest | null = null;

function readItem(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export const readDraftValues = (): CheckoutFormValues => restoreValues(readItem(DRAFT_KEY));

export function writeDraft(values: CheckoutFormValues): void {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, serializeDraft(values));
  } catch {
    // sessionStorage недоступен/переполнен — работаем без черновика
  }
}

export function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // нечего очищать
  }
}

/** id текущей попытки для состава корзины; создаётся при первом обращении и хранится в sessionStorage. */
export function getRequestId(cartKey: string): string {
  const raw = readItem(REQUEST_ID_KEY) ?? (memoryRequest ? JSON.stringify(memoryRequest) : null);
  const { id, changed } = resolveRequestId(raw, cartKey, generateUuid);
  if (changed) {
    memoryRequest = { id, cart_key: cartKey };
    try {
      window.sessionStorage.setItem(REQUEST_ID_KEY, JSON.stringify(memoryRequest));
    } catch {
      // остаётся в памяти вкладки
    }
  }
  return id;
}

export function clearRequestId(): void {
  memoryRequest = null;
  try {
    window.sessionStorage.removeItem(REQUEST_ID_KEY);
  } catch {
    // нечего очищать
  }
}
