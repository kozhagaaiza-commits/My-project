import { getCartProducts } from "@/lib/catalog-queries";
import { FEATURE_ATELIER } from "@/lib/config";
import { assertSameOrigin } from "@/lib/csrf";
import {
  countActiveReservationsByEmail, rpcCreateOrder, selectOrderByClientRequestId, selectOrderState,
} from "@/lib/orders/db";
import { getOrderSessionContext } from "@/lib/orders/session";
import { hashOrderToken, orderPageUrl, orderToken } from "@/lib/orders/token";
import { createPaymentForOrder } from "@/lib/payments/create";
import { limitOrders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCreateOrderHandler } from "./handler";

// POST /api/orders — создание заказа, бронь 30 минут, платёж ЮKassa (Блок 3 «Корзина и заказ», US-003).
// Логика и порядок проверок — в handler.ts; здесь только реальные зависимости.
// Service-role (Блок 5.10): create_order и чтение служебных колонок заказа — только на сервере.
const handler = createCreateOrderHandler({
  assertSameOrigin,
  limitOrders,
  getSessionContext: getOrderSessionContext,
  countActiveReservations: (email, excludeClientRequestId) =>
    countActiveReservationsByEmail(createAdminClient(), email, { excludeClientRequestId, now: new Date() }),
  createOrder: (params) => rpcCreateOrder(createAdminClient(), params),
  findOrderByClientRequestId: (id) => selectOrderByClientRequestId(createAdminClient(), id),
  getOrderState: (id) => selectOrderState(createAdminClient(), id),
  getCartProducts,
  createPayment: createPaymentForOrder,
  tokens: { orderToken: (id) => orderToken(id), hashOrderToken, orderPageUrl: (n, t) => orderPageUrl(n, t) },
  featureAtelier: FEATURE_ATELIER,
  now: () => new Date(),
});

export async function POST(request: Request) {
  return handler(request);
}
