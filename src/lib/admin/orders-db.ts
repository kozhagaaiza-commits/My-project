import "server-only";
import { z } from "zod";
import type { Db } from "@/lib/catalog/db";
import { POSTGREST_MAX_ROWS } from "@/lib/catalog/db";
import { DbError } from "@/lib/orders/errors";
import { ORDER_STATUSES_ALL, type AdminOrdersQuery } from "@/lib/schemas/admin-orders";
import { orderSearchFilter } from "./orders-search";

// Заказы для админки через service-role (5.10; 2.18): вызывать ТОЛЬКО после authorizeAdminApi — служебные колонки
// (admin_note, attention_reason, needs_attention, telegram_chat_id, client_request_id, order_status_history.note)
// сессионному клиенту не видны. Никогда select("*"): явные списки колонок; public_token_hash не читается вовсе;
// telegram_chat_id — только для факта подписки (boolean), client_request_id — только для ссылки на заказ в уведомлении.
// Каждый ответ PostgREST проверяется Zod; ошибка БД → DbError (→ 500). Клиент передаёт вызывающий код.

export const ADMIN_ORDERS_PAGE_SIZE = 20; // ORDER_PAGE_SIZE (config.ts), US-007

const ts = z.string().min(10);
const status = z.enum(ORDER_STATUSES_ALL);
const kind = z.enum(["stock", "preorder"]);
const deliveryMethod = z.enum(["moscow_courier", "cdek_pvz", "cdek_door"]);
const vehicleEmbed = z.object({
  make: z.string(), model: z.string(), generation: z.string(), year_from: z.number().int(), year_to: z.number().int().nullable(),
}).nullable();
const bigintId = z.union([z.number(), z.string()]).nullable();

interface PgResult { data: unknown; error: { message: string; code?: string } | null }

function parse<T>(scope: string, schema: z.ZodType<T>, res: PgResult): T {
  if (res.error) throw new DbError(scope, res.error.code || undefined, res.error.message);
  return schema.parse(res.data);
}

// ---------- Список ----------

export const ADMIN_ORDER_LIST_COLUMNS =
  "id,number,created_at,kind,status,price_tier,customer_name,customer_phone,customer_email," +
  "delivery_method,delivery_city,cdek_pvz_code,total,needs_attention,attention_reason," +
  "vehicle:vehicles(make,model,generation,year_from,year_to)";

export const adminOrderListRow = z.object({
  id: z.string(), number: z.string(), created_at: ts, kind, status, price_tier: z.string(),
  customer_name: z.string(), customer_phone: z.string(), customer_email: z.string(),
  delivery_method: deliveryMethod, delivery_city: z.string(), cdek_pvz_code: z.string().nullable(),
  total: z.number().int(), needs_attention: z.boolean(), attention_reason: z.string().nullable(),
  vehicle: vehicleEmbed,
});
export type AdminOrderListRow = z.infer<typeof adminOrderListRow>;

/** Фильтры, новые сверху (created_at desc, id desc для стабильной пагинации), по 20; count=exact для meta.total. */
export async function selectAdminOrders(c: Db, q: AdminOrdersQuery): Promise<{ rows: AdminOrderListRow[]; total: number }> {
  const build = (head: boolean) => {
    let b = c.from("orders").select(head ? "id" : ADMIN_ORDER_LIST_COLUMNS, { count: "exact", head });
    if (q.status) b = b.eq("status", q.status);
    if (q.kind) b = b.eq("kind", q.kind);
    if (q.attention === true) b = b.eq("needs_attention", true);
    if (q.q) {
      const f = orderSearchFilter(q.q);
      b = f.kind === "or" ? b.or(f.filter) : b.ilike(f.column, f.pattern);
    }
    return b;
  };
  const from = (q.page - 1) * ADMIN_ORDERS_PAGE_SIZE;
  const res = await build(false).order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(from, from + ADMIN_ORDERS_PAGE_SIZE - 1);
  // Страница за пределами списка: PostgREST отвечает 416 (PGRST103) — пустая страница с честным total.
  if (res.error && res.error.code === "PGRST103") {
    const head = await build(true);
    if (head.error) throw new DbError("orders.admin.count", head.error.code || undefined, head.error.message);
    return { rows: [], total: head.count ?? 0 };
  }
  const rows = parse("orders.admin.list", adminOrderListRow.array(), { data: res.data ?? [], error: res.error });
  if (typeof res.count !== "number") throw new Error("orders.admin.list: count missing");
  return { rows, total: res.count };
}

// ---------- Карточка ----------

export const ADMIN_ORDER_DETAIL_COLUMNS =
  "id,number,kind,status,customer_name,customer_phone,customer_email,delivery_method,delivery_city,delivery_address," +
  "delivery_postal_code,cdek_pvz_code,vin,customer_comment,total,tracking_number,courier_note,admin_note," +
  "customer_visible_note,expected_ready_at,needs_attention,attention_reason,telegram_chat_id,consent_pd_at," +
  "consent_policy_version,updated_at,vehicle:vehicles(make,model,generation,year_from,year_to)";

export const adminOrderDetailRow = z.object({
  id: z.string(), number: z.string(), kind, status,
  customer_name: z.string(), customer_phone: z.string(), customer_email: z.string(),
  delivery_method: deliveryMethod, delivery_city: z.string(), delivery_address: z.string().nullable(),
  delivery_postal_code: z.string().nullable(), cdek_pvz_code: z.string().nullable(),
  vin: z.string().nullable(), customer_comment: z.string().nullable(), total: z.number().int(),
  tracking_number: z.string().nullable(), courier_note: z.string().nullable(), admin_note: z.string().nullable(),
  customer_visible_note: z.string().nullable(), expected_ready_at: z.string().nullable(),
  needs_attention: z.boolean(), attention_reason: z.string().nullable(),
  telegram_chat_id: bigintId, consent_pd_at: ts, consent_policy_version: z.string(), updated_at: ts,
  vehicle: vehicleEmbed,
}).transform(({ telegram_chat_id, ...rest }) => ({ ...rest, telegram_subscribed: telegram_chat_id !== null }));
export type AdminOrderDetailRow = z.infer<typeof adminOrderDetailRow>;

export const ADMIN_ORDER_ITEM_COLUMNS = "product_id,title_snapshot,sku_snapshot,specs_snapshot,unit_price,quantity,line_total";
export const ADMIN_PAYMENT_COLUMNS = "id,yookassa_payment_id,status,amount,payment_method_type,created_at";
export const ADMIN_REFUND_COLUMNS = "id,payment_id,yookassa_refund_id,status,amount,reason,restock,error_message,created_at";
export const ADMIN_HISTORY_COLUMNS = "from_status,to_status,note,changed_by,created_at";

const itemRow = z.object({
  product_id: z.string().nullable(), title_snapshot: z.string(), sku_snapshot: z.string(),
  specs_snapshot: z.record(z.string(), z.unknown()).catch({}), unit_price: z.number().int(), quantity: z.number().int(),
  line_total: z.number().int(),
});
const paymentRow = z.object({
  id: z.string(), yookassa_payment_id: z.string(), status: z.string(), amount: z.number().int(),
  payment_method_type: z.string().nullable(), created_at: ts,
});
const refundRow = z.object({
  id: z.string(), payment_id: z.string(), yookassa_refund_id: z.string().nullable(), status: z.string(), amount: z.number().int(),
  reason: z.string(), restock: z.boolean(), error_message: z.string().nullable(), created_at: ts,
});
const historyRow = z.object({
  from_status: z.string().nullable(), to_status: z.string(), note: z.string().nullable(), changed_by: z.string().nullable(), created_at: ts,
});
const profileRow = z.object({ id: z.string(), full_name: z.string() });

export type AdminItemRow = z.infer<typeof itemRow>;
export type AdminPaymentRow = z.infer<typeof paymentRow>;
export type AdminRefundRow = z.infer<typeof refundRow>;
export type AdminHistoryRow = z.infer<typeof historyRow> & { changed_by_name: string | null };

export interface AdminOrderDetailData {
  order: AdminOrderDetailRow;
  items: AdminItemRow[];
  payments: AdminPaymentRow[];
  refunds: AdminRefundRow[];
  history: AdminHistoryRow[];
}

const byCreated = { ascending: true } as const;

async function selectHistory(c: Db, orderId: string): Promise<AdminHistoryRow[]> {
  const res = await c.from("order_status_history").select(ADMIN_HISTORY_COLUMNS).eq("order_id", orderId)
    .order("created_at", byCreated).order("id", byCreated);
  const rows = parse("order_status_history.admin", historyRow.array(), res);
  const ids = [...new Set(rows.map((r) => r.changed_by).filter((id): id is string => id !== null))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const pr = await c.from("profiles").select("id,full_name").in("id", ids);
    for (const p of parse("profiles.names", profileRow.array(), pr)) if (p.full_name.trim()) names.set(p.id, p.full_name.trim());
  }
  return rows.map((r) => ({ ...r, changed_by_name: r.changed_by === null ? null : names.get(r.changed_by) ?? null }));
}

/** Всё для карточки заказа; запросы параллельно (профили авторов истории — вторым шагом, без N+1). null — нет заказа. */
export async function loadAdminOrderDetail(c: Db, orderId: string): Promise<AdminOrderDetailData | null> {
  const [orderRes, itemsRes, paymentsRes, refundsRes, history] = await Promise.all([
    c.from("orders").select(ADMIN_ORDER_DETAIL_COLUMNS).eq("id", orderId).maybeSingle(),
    c.from("order_items").select(ADMIN_ORDER_ITEM_COLUMNS).eq("order_id", orderId).order("created_at", byCreated).order("id", byCreated),
    c.from("payments").select(ADMIN_PAYMENT_COLUMNS).eq("order_id", orderId).order("created_at", byCreated).limit(POSTGREST_MAX_ROWS),
    c.from("refunds").select(ADMIN_REFUND_COLUMNS).eq("order_id", orderId).order("created_at", byCreated).limit(POSTGREST_MAX_ROWS),
    selectHistory(c, orderId),
  ]);
  const order = parse("orders.admin.detail", adminOrderDetailRow.nullable(), orderRes);
  if (order === null) return null;
  return {
    order,
    items: parse("order_items.admin", itemRow.array(), itemsRes),
    payments: parse("payments.admin", paymentRow.array(), paymentsRes),
    refunds: parse("refunds.admin", refundRow.array(), refundsRes),
    history,
  };
}
