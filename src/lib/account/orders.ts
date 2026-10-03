import "server-only";
import { z } from "zod";
import { ORDER_PAGE_SIZE } from "@/lib/config";
import { formatRub } from "@/lib/money";
import { orderStatusLabel } from "@/lib/order-labels";
import type { Db } from "@/lib/catalog/db";
import type { AccountOrder, AccountOrdersPage } from "@/types/account";

// Заказы пользователя для /account и GET /api/account/orders (Блок 3, Блок 4 «Личный кабинет»).
// Читает service-role клиент (CLAUDE.md: служебные колонки orders скрыты от роли authenticated) — ТОЛЬКО для
// user_id, уже проверенного через auth.getUser(). Колонки явные: служебные поля заказа не запрашиваются.

export const ACCOUNT_ORDER_COLUMNS = "id,number,created_at,status,kind,total";

const orderRow = z.object({
  id: z.string(),
  number: z.string(),
  created_at: z.string().min(10),
  status: z.string(),
  kind: z.enum(["stock", "preorder"]),
  total: z.number().int(),
});
const itemRow = z.object({ order_id: z.string() });

export function toAccountOrder(row: z.infer<typeof orderRow>, itemsCount: number): AccountOrder {
  return {
    number: row.number,
    created_at: new Date(row.created_at).toISOString(),
    status: row.status,
    status_label: orderStatusLabel(row.status),
    kind: row.kind,
    total_formatted: formatRub(row.total),
    items_count: itemsCount,
    url: `/orders/${row.number}`,
  };
}

export async function listAccountOrders(db: Db, userId: string, page: number): Promise<AccountOrdersPage> {
  const from = (page - 1) * ORDER_PAGE_SIZE;
  const res = await db.from("orders").select(ACCOUNT_ORDER_COLUMNS, { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(from, from + ORDER_PAGE_SIZE - 1);
  if (res.error) throw new Error(`account.orders: ${res.error.code ?? ""} ${res.error.message}`);
  const rows = orderRow.array().parse(res.data ?? []);

  const counts = new Map<string, number>();
  if (rows.length > 0) {
    const items = await db.from("order_items").select("order_id").in("order_id", rows.map((r) => r.id));
    if (items.error) throw new Error(`account.order_items: ${items.error.code ?? ""} ${items.error.message}`);
    for (const { order_id } of itemRow.array().parse(items.data ?? [])) counts.set(order_id, (counts.get(order_id) ?? 0) + 1);
  }
  return {
    orders: rows.map((r) => toAccountOrder(r, counts.get(r.id) ?? 0)),
    total: res.count ?? rows.length,
    page,
    per_page: ORDER_PAGE_SIZE,
  };
}
