import { authorizeAdminApi } from "@/lib/admin/api-guard";
import { insertStatusHistory, selectOrderForChange, updateOrderStatus } from "@/lib/admin/orders-write";
import { notifyCustomerStatusChanged } from "@/lib/notifications/customer-status";
import { getDefaultNotifyDeps } from "@/lib/notifications/deps";
import { orderPageUrl, orderToken } from "@/lib/orders/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { createChangeStatusHandler } from "./handler";

// PATCH /api/admin/orders/[id]/status — переход статуса по таблице 5.3 (Блок 3). Логика — src/lib/admin/status-change.ts.
// Service-role (5.10, 2.18) — только после authorizeAdminApi. Уведомление покупателю — customer_status_changed (5.9.2):
// постановка в очередь, отправка после ответа (after()); сбой уведомления статус не откатывает.

const handler = createChangeStatusHandler({
  authorize: (request) => authorizeAdminApi(request, { mutation: true }),
  selectOrder: (orderId) => selectOrderForChange(createAdminClient(), orderId),
  updateStatus: (orderId, guard, patch) => updateOrderStatus(createAdminClient(), orderId, guard, patch),
  insertHistory: (row) => insertStatusHistory(createAdminClient(), row),
  notifyStatusChanged: async (p) => notifyCustomerStatusChanged(await getDefaultNotifyDeps(), p),
  orderUrl: (orderNumber, clientRequestId) => orderPageUrl(orderNumber, orderToken(clientRequestId)),
  now: () => new Date(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(request, { params });
}
