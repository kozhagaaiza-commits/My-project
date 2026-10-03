import { getSessionContext } from "@/lib/auth";
import { listAccountOrders } from "@/lib/account/orders";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAccountOrdersHandler } from "./handler";

// GET /api/account/orders — заказы текущего пользователя. Пользователь — только auth.getUser(); чтение заказов
// через service-role (служебные колонки скрыты колоночными правами) строго по user.id из сессии (CLAUDE.md).
const handler = createAccountOrdersHandler({
  getUserId: async () => (await getSessionContext()).user?.id ?? null,
  listOrders: (userId, page) => listAccountOrders(createAdminClient(), userId, page),
});

export async function GET(request: Request) {
  return handler(request);
}
