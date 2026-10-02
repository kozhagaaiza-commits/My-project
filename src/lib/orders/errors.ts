// Ошибки БД слоя заказов и разбор исключений create_order (Чертёж 2.14) — чистый модуль, без env и сети.
// create_order бросает исключения с errcode P0001 и message вида 'OUT_OF_STOCK:<uuid>'; PostgREST отдаёт их
// как { code: "P0001", message: "OUT_OF_STOCK:<uuid>" }. Перевод в HTTP-ответы Блока 3 — в handler POST /api/orders.

/** Ошибка PostgREST/RPC с кодом Postgres. message не уходит клиенту — только в console.error. */
export class DbError extends Error {
  readonly scope: string;
  readonly pgCode: string | undefined;
  readonly pgMessage: string;

  constructor(scope: string, pgCode: string | undefined, pgMessage: string) {
    super(`${scope}: ${pgCode ?? ""} ${pgMessage}`);
    this.name = "DbError";
    this.scope = scope;
    this.pgCode = pgCode;
    this.pgMessage = pgMessage;
  }
}

export type CreateOrderFailure =
  | { kind: "EMPTY_CART" | "TOO_MANY_LINES" | "DUPLICATE_ITEMS" | "MIXED_KINDS" | "PRICE_CHANGED" }
  | { kind: "PRODUCT_UNAVAILABLE" | "QTY_LIMIT" | "OUT_OF_STOCK"; productId: string };

const PLAIN = /^(EMPTY_CART|TOO_MANY_LINES|DUPLICATE_ITEMS|MIXED_KINDS|PRICE_CHANGED)$/;
const WITH_ID = /^(PRODUCT_UNAVAILABLE|QTY_LIMIT|OUT_OF_STOCK):([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})$/;

/** Бизнес-исключение create_order (P0001 из списка 2.14) или null — тогда это неожиданная ошибка (→ 500). */
export function classifyCreateOrderError(err: unknown): CreateOrderFailure | null {
  if (!(err instanceof DbError) || err.pgCode !== "P0001") return null;
  const msg = err.pgMessage.trim();
  const plain = PLAIN.exec(msg);
  if (plain) return { kind: plain[1] as "EMPTY_CART" | "TOO_MANY_LINES" | "DUPLICATE_ITEMS" | "MIXED_KINDS" | "PRICE_CHANGED" };
  const withId = WITH_ID.exec(msg);
  if (withId) return { kind: withId[1] as "PRODUCT_UNAVAILABLE" | "QTY_LIMIT" | "OUT_OF_STOCK", productId: withId[2].toLowerCase() };
  return null;
}

/**
 * Временные ошибки, после которых create_order повторяется один раз:
 * 40P01 deadlock, 40001 serialization failure; 23505 — гонка двух одинаковых запросов (один client_request_id
 * вставлен параллельно): повтор находит заказ по client_request_id и возвращает его (идемпотентность, Edge Case 1).
 */
const RETRYABLE_PG_CODES = new Set(["40P01", "40001", "23505"]);

export function isRetryableDbError(err: unknown): boolean {
  return err instanceof DbError && err.pgCode !== undefined && RETRYABLE_PG_CODES.has(err.pgCode);
}

/**
 * PaymentOrderError из src/lib/payments/create.ts (страховка от гонки: заказ успели оплатить/отменить между проверкой
 * и созданием платежа). Распознаётся по name/code без runtime-импорта модуля платежей (он тянет env и ЮKassa).
 */
export function paymentOrderErrorCode(err: unknown): "ORDER_NOT_FOUND" | "ORDER_NOT_PAYABLE" | null {
  if (!(err instanceof Error) || err.name !== "PaymentOrderError") return null;
  const code: unknown = (err as Error & { code?: unknown }).code;
  return code === "ORDER_NOT_FOUND" || code === "ORDER_NOT_PAYABLE" ? code : null;
}
