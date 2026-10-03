import { assertSameOrigin } from "@/lib/csrf";
import { rpcCancelExpiredOrders, selectOrderForAccess } from "@/lib/orders/db";
import { getOrderSessionContext } from "@/lib/orders/session";
import { createPaymentForOrder } from "@/lib/payments/create";
import { limitPay } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPayOrderHandler } from "./handler";

// POST /api/orders/[number]/pay?t=<token> — новый (или переиспользованный) платёж для неоплаченного заказа (Блок 3).
// Логика — в handler.ts. Service-role: чтение public_token_hash после проверки формата номера (2.18, 5.10).
// Route segment config (Next 16): потолок времени функции. Платёж ЮKassa ограничен PAYMENT_DEADLINE_MS (25 с),
// чтобы успеть ответить 502 с ссылкой на заказ до обрыва функции платформой (Edge Case 2).
export const maxDuration = 60;

const handler = createPayOrderHandler({
  assertSameOrigin,
  limitPay,
  getSessionContext: getOrderSessionContext,
  selectOrderForAccess: (number) => selectOrderForAccess(createAdminClient(), number),
  cancelExpiredOrders: () => rpcCancelExpiredOrders(createAdminClient()),
  createPayment: createPaymentForOrder,
  now: () => new Date(),
});

export async function POST(request: Request, { params }: { params: Promise<{ number: string }> }) {
  return handler(request, { params });
}
