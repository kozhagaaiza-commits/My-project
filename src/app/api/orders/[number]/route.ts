import { getOrderView } from "@/lib/orders/get-view";
import { getOrderSessionContext } from "@/lib/orders/session";
import { limitOrderRead } from "@/lib/rate-limit";
import { createGetOrderHandler } from "./handler";

// GET /api/orders/[number]?t=<token> — заказ для страницы статуса (Блок 3). Логика — в handler.ts и
// src/lib/orders/get-view.ts. Service-role (2.18, 5.10): служебные колонки читаются только после проверки
// токена / владельца / admin; наружу — только OrderView.
// Потолок функции: сверка с ЮKassa ограничена RECONCILE_BUDGET_MS, остаток — в after().
export const maxDuration = 30;

const handler = createGetOrderHandler({
  limitOrderRead,
  getSessionContext: getOrderSessionContext,
  getOrderView,
});

export async function GET(request: Request, { params }: { params: Promise<{ number: string }> }) {
  return handler(request, { params });
}
