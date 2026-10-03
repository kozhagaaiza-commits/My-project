import { after } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/api-guard";
import { loadAdminOrderDetail } from "@/lib/admin/orders-db";
import { selectOrderForChange, updateOrderMeta } from "@/lib/admin/orders-write";
import { rpcCancelExpiredOrders } from "@/lib/orders/db";
import { reconcileOrderPayments } from "@/lib/payments/reconcile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createGetAdminOrderHandler, createPatchAdminOrderHandler } from "./handler";

// GET /api/admin/orders/[id] — карточка заказа; PATCH — заметки, трек, срок, снятие отметки (Блок 3). Логика — в handler.ts.
// Service-role (5.10, 2.18): служебные колонки читаются и пишутся ТОЛЬКО после authorizeAdminApi.
// Потолок функции: сверка с ЮKassa ограничена ADMIN_RECONCILE_BUDGET_MS, остаток — в after().
export const maxDuration = 30;

const getHandler = createGetAdminOrderHandler({
  authorize: (request) => authorizeAdminApi(request),
  cancelExpiredOrders: () => rpcCancelExpiredOrders(createAdminClient()),
  loadDetail: (orderId) => loadAdminOrderDetail(createAdminClient(), orderId),
  reconcileOrderPayments,
  continueAfterResponse: (task) => after(() => task),
});

const patchHandler = createPatchAdminOrderHandler({
  authorize: (request) => authorizeAdminApi(request, { mutation: true }),
  selectOrder: (orderId) => selectOrderForChange(createAdminClient(), orderId),
  updateMeta: (orderId, updatedAt, patch) => updateOrderMeta(createAdminClient(), orderId, updatedAt, patch),
  // notifyDeliveryChanged не задан: шаблона «Срок поставки изменился» в Чертеже нет (см. src/lib/admin/meta-patch.ts).
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return getHandler(request, { params });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return patchHandler(request, { params });
}
