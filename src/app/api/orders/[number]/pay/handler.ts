import { NextResponse } from "next/server";
import { PRIVATE_NO_STORE, internalError } from "@/lib/catalog/http";
import { ORDER_TOKEN_RE, verifyOrderAccess, type OrderSessionContext } from "@/lib/orders/access";
import type { OrderAccessRow } from "@/lib/orders/db";
import { paymentOrderErrorCode } from "@/lib/orders/errors";
import { orderNotFound, orderNotPayable, payPaymentProviderError } from "@/lib/orders/responses";
import { PAYMENT_DEADLINE_MS, logPaymentFailure, type OrderPaymentOptions } from "@/lib/orders/replay";
import type { CreatePaymentResult } from "@/lib/payments/create";
import { orderParams } from "@/lib/schemas/orders";
import type { PayOrderResponse } from "@/types/orders";

// Тело POST /api/orders/[number]/pay?t=<token> (Блок 3; US-003 п.10; Edge Cases 2, 37, 43).
// Порядок: Origin → номер (регэксп; неверный → 404) → rate limit 10/600 с на заказ (fail-closed) → доступ
// (токен ИЛИ владелец; admin не платит за покупателя) → ленивая отмена истёкших броней → оплачиваемость → платёж.
// Тело запроса пустое `{}` и не читается.

export interface PayOrderDeps {
  assertSameOrigin(request: Request): Response | null;
  /** 10 / 600 с на заказ с IP (pay:<number>:<ip>) и 100 / 600 с на заказ (pay:<number>); сбой хранилища — БРОСАЕТ (→ 500). */
  limitPay(request: Request, orderNumber: string): Promise<Response | null>;
  getSessionContext(): Promise<OrderSessionContext>;
  selectOrderForAccess(orderNumber: string): Promise<OrderAccessRow | null>;
  /** rpc cancel_expired_orders(); ошибка не роняет запрос. */
  cancelExpiredOrders(): Promise<number>;
  createPayment(orderId: string, opts: OrderPaymentOptions): Promise<CreatePaymentResult>;
  now(): Date;
}

/** Блок 3: pending-платёж младше 10 минут переиспользуется (его confirmation_url), новый не создаётся. */
export const PAY_REUSE_SECONDS = 600;

export interface PayRouteContext {
  params: Promise<{ number: string }>;
}

async function handle(request: Request, routeCtx: PayRouteContext, deps: PayOrderDeps): Promise<Response> {
  const forbidden = deps.assertSameOrigin(request);
  if (forbidden) return forbidden;

  // Неверный формат номера — тот же 404, что и «нет заказа» (Блок 5.10); ключ лимита — только валидный номер.
  const params = orderParams.safeParse(await routeCtx.params);
  if (!params.success) return orderNotFound();
  const number = params.data.number;

  const limited = await deps.limitPay(request, number);
  if (limited) return limited;

  const t = new URL(request.url).searchParams.get("t");
  const token = t !== null && ORDER_TOKEN_RE.test(t) ? t : null;
  const session = await deps.getSessionContext();
  const access = await verifyOrderAccess(
    { number, token, ctx: session, allowAdmin: false },
    { selectOrder: deps.selectOrderForAccess },
  );
  if (!access.found) return orderNotFound();
  const order = access.order;

  // Ленивая отмена (как перед чтением заказа в GET): статус в БД догоняет истёкшую бронь. Оплачиваемость ниже
  // проверяется по reserved_until уже прочитанной строки, поэтому сбой отмены на ответ не влияет.
  try {
    await deps.cancelExpiredOrders();
  } catch (err) {
    console.error({ scope: "orders.pay.cancelExpired", orderId: order.id, err });
  }

  const reservedUntil = order.reserved_until === null ? null : new Date(order.reserved_until);
  if (order.status !== "pending_payment" || reservedUntil === null || reservedUntil <= deps.now()) {
    return orderNotPayable();
  }

  let payment: CreatePaymentResult;
  try {
    payment = await deps.createPayment(order.id, { reuseWithinSeconds: PAY_REUSE_SECONDS, deadlineMs: PAYMENT_DEADLINE_MS });
  } catch (err) {
    // Гонка (заказ оплачен / отменён после проверки выше) — не сбой провайдера: те же ответы, что без гонки.
    const code = paymentOrderErrorCode(err);
    if (code === "ORDER_NOT_PAYABLE") return orderNotPayable();
    if (code === "ORDER_NOT_FOUND") return orderNotFound();
    console.error({ scope: "orders.pay.payment", orderId: order.id, err });
    return payPaymentProviderError();
  }
  if (!payment.ok) {
    // provider_unavailable (в т.ч. исчерпан deadlineMs) и provider_rejected — один и тот же 502 из Блока 3.
    logPaymentFailure("orders.pay.payment", order.id, payment);
    return payPaymentProviderError();
  }
  const data: PayOrderResponse = { confirmation_url: payment.confirmationUrl };
  return NextResponse.json({ data });
}

export function createPayOrderHandler(deps: PayOrderDeps) {
  return async function POST(request: Request, routeCtx: PayRouteContext): Promise<Response> {
    let res: Response;
    try {
      res = await handle(request, routeCtx, deps);
    } catch (err) {
      res = internalError("orders.pay", err);
    }
    // Ответ зависит от токена/сессии и содержит ссылку на оплату: никогда не кэшируется.
    res.headers.set("Cache-Control", PRIVATE_NO_STORE);
    return res;
  };
}
