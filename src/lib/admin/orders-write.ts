import "server-only";
import { z } from "zod";
import type { Db } from "@/lib/catalog/db";
import { DbError } from "@/lib/orders/errors";
import { ORDER_STATUSES_ALL } from "@/lib/schemas/admin-orders";
import type { OrderStatus } from "@/types/order-view";

// Изменение заказа админом через service-role (5.10; 2.18) — вызывать ТОЛЬКО после authorizeAdminApi.
// Оптимистическая блокировка (Edge Case 14): update … where id = $1 and updated_at = $2 [and status = $3];
// 0 строк → null (→ 409 CONFLICT). updated_at в фильтр передаётся строкой ИЗ БД (после проверки sameInstant с телом),
// чтобы микросекунды совпали точно. client_request_id читается только для ссылки на заказ в уведомлении покупателю.

const ts = z.string().min(10);
const status = z.enum(ORDER_STATUSES_ALL);

interface PgResult { data: unknown; error: { message: string; code?: string } | null }

function parse<T>(scope: string, schema: z.ZodType<T>, res: PgResult): T {
  if (res.error) throw new DbError(scope, res.error.code || undefined, res.error.message);
  return schema.parse(res.data);
}

export const ORDER_CHANGE_COLUMNS =
  "id,number,kind,status,delivery_method,tracking_number,courier_note,expected_ready_at,customer_visible_note," +
  "customer_email,client_request_id,updated_at";

export const orderChangeRow = z.object({
  id: z.string(), number: z.string(), kind: z.enum(["stock", "preorder"]), status,
  delivery_method: z.enum(["moscow_courier", "cdek_pvz", "cdek_door"]),
  tracking_number: z.string().nullable(), courier_note: z.string().nullable(),
  expected_ready_at: z.string().nullable(), customer_visible_note: z.string().nullable(),
  customer_email: z.string(), client_request_id: z.string(), updated_at: ts,
});
export type OrderChangeRow = z.infer<typeof orderChangeRow>;

export async function selectOrderForChange(c: Db, orderId: string): Promise<OrderChangeRow | null> {
  const res = await c.from("orders").select(ORDER_CHANGE_COLUMNS).eq("id", orderId).maybeSingle();
  return parse("orders.admin.forChange", orderChangeRow.nullable(), res);
}

export interface StatusPatch {
  status: OrderStatus;
  shipped_at?: string;
  delivered_at?: string;
  cancelled_at?: string;
  tracking_number?: string;
  courier_note?: string;
}

const statusResultRow = z.object({ id: z.string(), status, updated_at: ts });
export type StatusResultRow = z.infer<typeof statusResultRow>;

/** Переход статуса с блокировкой по updated_at И текущему статусу. null — заказ изменили параллельно. */
export async function updateOrderStatus(
  c: Db, orderId: string, guard: { updatedAt: string; fromStatus: OrderStatus }, patch: StatusPatch,
): Promise<StatusResultRow | null> {
  const res = await c.from("orders").update(patch)
    .eq("id", orderId).eq("updated_at", guard.updatedAt).eq("status", guard.fromStatus)
    .select("id,status,updated_at").maybeSingle();
  return parse("orders.admin.updateStatus", statusResultRow.nullable(), res);
}

export interface StatusHistoryInsert {
  order_id: string;
  from_status: OrderStatus;
  to_status: OrderStatus;
  changed_by: string;
  note: string | null;
}

export async function insertStatusHistory(c: Db, row: StatusHistoryInsert): Promise<void> {
  const res = await c.from("order_status_history").insert(row);
  if (res.error) throw new DbError("order_status_history.insert", res.error.code || undefined, res.error.message);
}

export interface MetaPatch {
  expected_ready_at?: string | null;
  customer_visible_note?: string | null;
  admin_note?: string | null;
  tracking_number?: string | null;
  courier_note?: string | null;
  needs_attention?: boolean;
}

const metaResultRow = z.object({ id: z.string(), expected_ready_at: z.string().nullable(), updated_at: ts });
export type MetaResultRow = z.infer<typeof metaResultRow>;

/** Заметки, трек, срок — с блокировкой по updated_at. null — заказ изменили параллельно. */
export async function updateOrderMeta(c: Db, orderId: string, updatedAt: string, patch: MetaPatch): Promise<MetaResultRow | null> {
  const res = await c.from("orders").update(patch).eq("id", orderId).eq("updated_at", updatedAt)
    .select("id,expected_ready_at,updated_at").maybeSingle();
  return parse("orders.admin.updateMeta", metaResultRow.nullable(), res);
}
