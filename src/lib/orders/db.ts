import "server-only";
import { z } from "zod";
import type { Db } from "@/lib/catalog/db";
import { PRIVACY_POLICY_VERSION } from "@/lib/config";
import type { CreateOrderBody } from "@/lib/schemas/orders";
import { DbError } from "./errors";

// Доступ к заказам через service-role (Блок 5.10: create_order; страница заказа — чтение служебных колонок
// после проверки токена/владельца, 2.18). Клиент создаёт вызывающий код (route.ts) — модуль не импортирует env
// и тестируется на мок-клиенте. Из orders — только явные списки колонок, никогда select("*");
// каждый ответ PostgREST проверяется Zod-схемой; ошибка БД → DbError (→ 500 или разбор в handler).

export const ORDER_STATUSES = [
  "pending_payment", "paid", "confirmed", "ordered_from_supplier", "in_transit", "arrived",
  "shipped", "delivered", "cancelled", "refunded",
] as const;
const orderStatus = z.enum(ORDER_STATUSES);
const orderKind = z.enum(["stock", "preorder"]);

/** Колонки для проверки доступа и оплаты (public_token_hash — только сравнение на сервере, наружу не уходит). */
export const ORDER_ACCESS_COLUMNS = "id,number,status,kind,user_id,public_token_hash,reserved_until,total";
export const ORDER_STATE_COLUMNS = "id,status,reserved_until";
export const ORDER_IDEMPOTENCY_COLUMNS = "id,number,total,kind";

export const createdOrderRow = z.object({
  order_id: z.string(),
  order_number: z.string(),
  order_total: z.number().int(),
  order_kind: orderKind,
});
export type CreatedOrder = z.infer<typeof createdOrderRow>;

export const orderAccessRow = z.object({
  id: z.string(),
  number: z.string(),
  status: orderStatus,
  kind: orderKind,
  user_id: z.string().nullable(),
  public_token_hash: z.string(),
  reserved_until: z.string().nullable(),
  total: z.number().int(),
});
export type OrderAccessRow = z.infer<typeof orderAccessRow>;

export const orderStateRow = z.object({ id: z.string(), status: orderStatus, reserved_until: z.string().nullable() });
export type OrderStateRow = z.infer<typeof orderStateRow>;

const idempotencyRow = z.object({ id: z.string(), number: z.string(), total: z.number().int(), kind: orderKind });

interface PgError { message: string; code?: string }

function check(scope: string, error: PgError | null): void {
  if (error) throw new DbError(scope, error.code || undefined, error.message);
}

/** Аргументы create_order: p_order — ровно поля из комментария 2.14, p_items — [{product_id, quantity}]. */
export interface CreateOrderParams {
  p_order: {
    client_request_id: string;
    public_token_hash: string;
    user_id: string | null;
    atelier_id: string | null;
    customer_name: string;
    customer_phone: string;
    customer_email: string;
    delivery_method: CreateOrderBody["delivery"]["method"];
    delivery_city: string;
    delivery_address: string | null;
    delivery_postal_code: string | null;
    cdek_pvz_code: string | null;
    vehicle_id: string | null;
    vin: string | null;
    customer_comment: string | null;
    consent_policy_version: string;
    expected_total: number;
  };
  p_items: Array<{ product_id: string; quantity: number }>;
}

/**
 * p_order/p_items из тела, уже прошедшего Zod (телефон — +7XXXXXXXXXX, email в нижнем регистре, VIN и код ПВЗ
 * в верхнем). atelier_id передаётся только одобренному ателье при FEATURE_ATELIER — его решает вызывающий код
 * (BR-10/BR-20): по нему create_order выбирает price_tier. Пустой комментарий → null.
 */
export function buildCreateOrderParams(
  body: CreateOrderBody,
  who: { userId: string | null; atelierId: string | null },
  publicTokenHash: string,
): CreateOrderParams {
  return {
    p_order: {
      client_request_id: body.client_request_id,
      public_token_hash: publicTokenHash,
      user_id: who.userId,
      atelier_id: who.atelierId,
      customer_name: body.customer.name,
      customer_phone: body.customer.phone,
      customer_email: body.customer.email,
      delivery_method: body.delivery.method,
      delivery_city: body.delivery.city,
      delivery_address: body.delivery.address,
      delivery_postal_code: body.delivery.postal_code,
      cdek_pvz_code: body.delivery.cdek_pvz_code,
      vehicle_id: body.vehicle_id,
      vin: body.vin,
      customer_comment: body.comment === null || body.comment === "" ? null : body.comment,
      consent_policy_version: PRIVACY_POLICY_VERSION,
      expected_total: body.expected_total,
    },
    p_items: body.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
  };
}

/** rpc create_order → одна строка {order_id, order_number, order_total, order_kind}. Ошибка Postgres → DbError с кодом. */
export async function rpcCreateOrder(c: Db, params: CreateOrderParams): Promise<CreatedOrder> {
  const { data, error } = await c.rpc("create_order", { p_order: params.p_order, p_items: params.p_items });
  check("rpc.create_order", error);
  const rows = createdOrderRow.array().parse(data);
  if (rows.length !== 1) throw new Error(`rpc.create_order: expected 1 row, got ${rows.length}`);
  return rows[0];
}

/** Заказ по client_request_id (гонка двух одинаковых запросов, Edge Case 1) — в форме ответа create_order. */
export async function selectOrderByClientRequestId(c: Db, clientRequestId: string): Promise<CreatedOrder | null> {
  const { data, error } = await c.from("orders").select(ORDER_IDEMPOTENCY_COLUMNS)
    .eq("client_request_id", clientRequestId).maybeSingle();
  check("orders.byClientRequestId", error);
  if (data === null) return null;
  const r = idempotencyRow.parse(data);
  return { order_id: r.id, order_number: r.number, order_total: r.total, order_kind: r.kind };
}

/** Заказ по номеру для проверки доступа (токен / владелец / admin) и оплаты. */
export async function selectOrderForAccess(c: Db, number: string): Promise<OrderAccessRow | null> {
  const { data, error } = await c.from("orders").select(ORDER_ACCESS_COLUMNS).eq("number", number).maybeSingle();
  check("orders.forAccess", error);
  return data === null ? null : orderAccessRow.parse(data);
}

/** Статус и бронь по id (ответ 201 POST /api/orders: reserved_until). */
export async function selectOrderState(c: Db, id: string): Promise<OrderStateRow | null> {
  const { data, error } = await c.from("orders").select(ORDER_STATE_COLUMNS).eq("id", id).maybeSingle();
  check("orders.state", error);
  return data === null ? null : orderStateRow.parse(data);
}

/** Экранирование % _ \ для ILIKE: сравнение без учёта регистра, без шаблонов. */
export const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * BR-18: число неоплаченных заказов с действующей бронью на email — lower(customer_email) = lower($1)
 * (ILIKE без шаблонов), status = 'pending_payment', reserved_until > now. Заказ с тем же client_request_id
 * не считается: повтор того же запроса (Edge Case 1) должен вернуть уже созданный заказ, а не 429.
 */
export async function countActiveReservationsByEmail(
  c: Db, email: string, opts: { excludeClientRequestId: string; now: Date },
): Promise<number> {
  const { count, error } = await c.from("orders").select("id", { count: "exact", head: true })
    .ilike("customer_email", escapeLike(email.trim()))
    .eq("status", "pending_payment")
    .gt("reserved_until", opts.now.toISOString())
    .neq("client_request_id", opts.excludeClientRequestId);
  check("orders.pendingByEmail", error);
  if (typeof count !== "number") throw new Error("orders.pendingByEmail: count missing");
  return count;
}

/** Ленивая отмена истёкших броней (2.14 cancel_expired_orders) → число отменённых заказов. */
export async function rpcCancelExpiredOrders(c: Db): Promise<number> {
  const { data, error } = await c.rpc("cancel_expired_orders");
  check("rpc.cancel_expired_orders", error);
  return z.number().int().parse(data);
}
