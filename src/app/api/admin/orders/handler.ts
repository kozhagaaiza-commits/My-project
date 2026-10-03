import { apiError } from "@/lib/api-error";
import type { AdminApiAuth } from "@/lib/admin/api-guard";
import { adminInternalError, adminOk, noStore } from "@/lib/admin/http";
import { buildAdminOrderListItem } from "@/lib/admin/order-view";
import type { AdminOrderListRow } from "@/lib/admin/orders-db";
import { ADMIN_ORDERS_PAGE_SIZE } from "@/lib/admin/orders-db";
import { queryObject } from "@/lib/catalog/http";
import { adminOrdersQuery, type AdminOrdersQuery } from "@/lib/schemas/admin-orders";
import { z } from "zod";

// Тело GET /api/admin/orders (Блок 3; US-007: фильтр по статусу, новые сверху, по 20; needs_attention в строке).
// Порядок: admin (401 / 403 / 429) → Zod параметров → ленивая отмена истёкших броней (сбой — в лог) → список → { data, meta }.

export interface ListOrdersDeps {
  authorize(request: Request): Promise<AdminApiAuth>;
  /** rpc cancel_expired_orders(): статусы в списке актуальны (BR-06). */
  cancelExpiredOrders(): Promise<number>;
  listOrders(q: AdminOrdersQuery): Promise<{ rows: AdminOrderListRow[]; total: number }>;
}

export const ADMIN_QUERY_MESSAGE = "Неверные параметры запроса";

async function handle(request: Request, deps: ListOrdersDeps): Promise<Response> {
  const auth = await deps.authorize(request);
  if (!auth.ok) return auth.response;

  const parsed = adminOrdersQuery.safeParse(queryObject(request.url));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", ADMIN_QUERY_MESSAGE, 400, { fields: z.flattenError(parsed.error).fieldErrors });
  }

  try {
    await deps.cancelExpiredOrders();
  } catch (err) {
    console.error({ scope: "admin.orders.list.cancelExpired", err });
  }

  const { rows, total } = await deps.listOrders(parsed.data);
  return adminOk(rows.map(buildAdminOrderListItem), { total, page: parsed.data.page, per_page: ADMIN_ORDERS_PAGE_SIZE });
}

export function createListOrdersHandler(deps: ListOrdersDeps) {
  return async function GET(request: Request): Promise<Response> {
    try {
      return noStore(await handle(request, deps));
    } catch (err) {
      return noStore(adminInternalError("admin.orders.list", err));
    }
  };
}
