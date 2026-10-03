import "server-only";
import { z } from "zod";
import type { Db } from "@/lib/catalog/db";
import { ORDER_STATUSES } from "./db";
import { DbError } from "./errors";
import type { OrderHistoryEntry, OrderViewData, OrderViewItemRecord, OrderViewOrder } from "./view";

// Чтение заказа для страницы статуса (Блок 3: GET /api/orders/[number]) через service-role — ТОЛЬКО после проверки
// доступа (токен / владелец / admin, verifyOrderAccess). Колоночные права 2.18 скрывают служебные колонки от
// сессионного клиента, поэтому чтение — здесь, с явными списками колонок:
//  - из orders НИКОГДА не читаются admin_note, attention_reason, needs_attention, public_token_hash, client_request_id;
//    telegram_chat_id читается только чтобы вернуть факт подписки (boolean), сам id наружу не выходит;
//  - из order_status_history — только to_status и created_at (note и changed_by скрыты);
//  - из refunds — только amount успешных возвратов; из products — только id и slug.
// Каждый ответ PostgREST проверяется Zod; ошибка БД → DbError (→ 500). Клиент передаёт вызывающий код.

export const ORDER_VIEW_COLUMNS =
  "id,number,kind,status,delivery_method,delivery_city,delivery_address,cdek_pvz_code,total," +
  "reserved_until,paid_at,expected_ready_at,shipped_at,delivered_at,cancel_reason," +
  "tracking_number,courier_note,customer_visible_note,telegram_chat_id,customer_name,customer_email,customer_phone";
export const ORDER_VIEW_ITEM_COLUMNS = "title_snapshot,quantity,unit_price,line_total,product_id";
export const ORDER_VIEW_HISTORY_COLUMNS = "to_status,created_at";
export const ORDER_VIEW_REFUND_COLUMNS = "amount";
export const ORDER_VIEW_PRODUCT_COLUMNS = "id,slug";

const ts = z.string().min(10);

export const orderViewRow = z.object({
  id: z.string(),
  number: z.string(),
  kind: z.enum(["stock", "preorder"]),
  status: z.enum(ORDER_STATUSES),
  delivery_method: z.enum(["moscow_courier", "cdek_pvz", "cdek_door"]),
  delivery_city: z.string(),
  delivery_address: z.string().nullable(),
  cdek_pvz_code: z.string().nullable(),
  total: z.number().int(),
  reserved_until: ts.nullable(),
  paid_at: ts.nullable(),
  expected_ready_at: z.string().nullable(),
  shipped_at: ts.nullable(),
  delivered_at: ts.nullable(),
  cancel_reason: z.string().nullable(),
  tracking_number: z.string().nullable(),
  courier_note: z.string().nullable(),
  customer_visible_note: z.string().nullable(),
  // bigint: PostgREST отдаёт числом (или строкой при больших значениях) — нужен только факт наличия.
  telegram_chat_id: z.union([z.number(), z.string()]).nullable(),
  customer_name: z.string(),
  customer_email: z.string(),
  customer_phone: z.string(),
}).transform(({ telegram_chat_id, ...rest }): OrderViewOrder => ({ ...rest, telegram_subscribed: telegram_chat_id !== null }));

const itemRow = z.object({
  title_snapshot: z.string(),
  quantity: z.number().int(),
  unit_price: z.number().int(),
  line_total: z.number().int(),
  product_id: z.string().nullable(),
});
const historyRow = z.object({ to_status: z.string(), created_at: ts });
const refundRow = z.object({ amount: z.number().int() });
const productRow = z.object({ id: z.string(), slug: z.string() });

interface PgResult { data: unknown; error: { message: string; code?: string } | null }

function parse<T>(scope: string, schema: z.ZodType<T>, res: PgResult): T {
  if (res.error) throw new DbError(scope, res.error.code || undefined, res.error.message);
  return schema.parse(res.data);
}

export async function selectOrderViewRow(c: Db, orderId: string): Promise<OrderViewOrder | null> {
  const res = await c.from("orders").select(ORDER_VIEW_COLUMNS).eq("id", orderId).maybeSingle();
  return parse("orders.view", orderViewRow.nullable(), res);
}

/** Позиции + слаги товаров: два запроса на заказ (позиции, затем products по списку id), без N+1. */
export async function selectOrderViewItems(c: Db, orderId: string): Promise<OrderViewItemRecord[]> {
  const res = await c.from("order_items").select(ORDER_VIEW_ITEM_COLUMNS).eq("order_id", orderId)
    .order("created_at", { ascending: true }).order("id", { ascending: true });
  const items = parse("order_items.view", itemRow.array(), res);
  const ids = [...new Set(items.map((i) => i.product_id).filter((id): id is string => id !== null))];
  const slugs = new Map<string, string>();
  if (ids.length > 0) {
    const pr = await c.from("products").select(ORDER_VIEW_PRODUCT_COLUMNS).in("id", ids);
    for (const p of parse("products.slugs", productRow.array(), pr)) slugs.set(p.id, p.slug);
  }
  return items.map((i) => ({
    title: i.title_snapshot,
    quantity: i.quantity,
    unit_price: i.unit_price,
    line_total: i.line_total,
    product_slug: i.product_id === null ? null : slugs.get(i.product_id) ?? null,
  }));
}

export async function selectOrderHistory(c: Db, orderId: string): Promise<OrderHistoryEntry[]> {
  const res = await c.from("order_status_history").select(ORDER_VIEW_HISTORY_COLUMNS).eq("order_id", orderId)
    .order("created_at", { ascending: true });
  return parse("order_status_history.view", historyRow.array(), res);
}

/** Сумма успешных возвратов, копейки (Блок 4: «Деньги возвращены: 133 700 ₽»; Edge Case 38 — частичный). */
export async function sumSucceededRefunds(c: Db, orderId: string): Promise<number> {
  const res = await c.from("refunds").select(ORDER_VIEW_REFUND_COLUMNS).eq("order_id", orderId).eq("status", "succeeded");
  return parse("refunds.view", refundRow.array(), res).reduce((s, r) => s + r.amount, 0);
}

/** Всё для buildOrderView; запросы параллельно. null — заказа нет. */
export async function loadOrderViewData(c: Db, orderId: string): Promise<OrderViewData | null> {
  const [order, items, history, refunded] = await Promise.all([
    selectOrderViewRow(c, orderId),
    selectOrderViewItems(c, orderId),
    selectOrderHistory(c, orderId),
    sumSucceededRefunds(c, orderId),
  ]);
  return order === null ? null : { order, items, history, refunded_amount: refunded };
}
