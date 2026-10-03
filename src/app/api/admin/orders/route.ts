import { authorizeAdminApi } from "@/lib/admin/api-guard";
import { selectAdminOrders } from "@/lib/admin/orders-db";
import { rpcCancelExpiredOrders } from "@/lib/orders/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { createListOrdersHandler } from "./handler";

// GET /api/admin/orders — список заказов админки (Блок 3). Логика — в handler.ts.
// Service-role (5.10, 2.18): служебные колонки (needs_attention, attention_reason) читаются ТОЛЬКО после authorizeAdminApi.

const handler = createListOrdersHandler({
  authorize: (request) => authorizeAdminApi(request),
  cancelExpiredOrders: () => rpcCancelExpiredOrders(createAdminClient()),
  listOrders: (q) => selectAdminOrders(createAdminClient(), q),
});

export async function GET(request: Request) {
  return handler(request);
}
