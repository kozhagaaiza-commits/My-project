import { adminProductsDeps } from "@/lib/admin/products/real-deps";
import { createAdminProductsHandlers } from "./handler";

// GET /api/admin/products, POST /api/admin/products (Блок 3 «Админка — товары»). Логика — в handler.ts.
// Сессионный клиент (RLS is_admin()); service-role — только RPC reserved_qty_map после проверки роли.

const handlers = createAdminProductsHandlers(adminProductsDeps);

export async function GET(request: Request) {
  return handlers.GET(request);
}

export async function POST(request: Request) {
  return handlers.POST(request);
}
