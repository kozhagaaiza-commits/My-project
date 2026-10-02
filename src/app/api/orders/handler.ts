import { NextResponse } from "next/server";
import { buildCartValidation } from "@/lib/cart/validate";
import { isAtelierPricing } from "@/lib/catalog";
import { PRIVATE_NO_STORE, internalError } from "@/lib/catalog/http";
import { formatRub } from "@/lib/money";
import type { OrderSessionContext } from "@/lib/orders/access";
import { buildCreateOrderParams, type CreateOrderParams, type CreatedOrder, type OrderStateRow } from "@/lib/orders/db";
import { classifyCreateOrderError, isRetryableDbError, paymentOrderErrorCode, type CreateOrderFailure } from "@/lib/orders/errors";
import {
  MAX_PENDING_ORDERS_PER_EMAIL, fieldErrorsByPath, mixedKinds, orderNotPayable, orderPaymentProviderError,
  orderValidationError, outOfStock, priceChanged, productUnavailable, qtyLimit, tooManyPendingOrders,
} from "@/lib/orders/responses";
import type { CreatePaymentOptions, CreatePaymentResult } from "@/lib/payments/create";
import { createOrderBody, type CreateOrderBody } from "@/lib/schemas/orders";
import type { CartProduct } from "@/types/cart";
import type { CatalogContext } from "@/types/catalog";
import type { CreateOrderResponse } from "@/types/orders";

// Тело POST /api/orders (Блок 3; US-003; BR-02/03/04/05/07/10/11/18; Edge Cases 1, 10, 20, 27, 43).
// Все зависимости внедряются (route.ts — реальные), модуль не импортирует env и service-role клиент.
// Порядок: Origin → rate limit (fail-closed) → JSON → Zod → сессия → BR-18 → токен → create_order → платёж → 201.

export interface CreateOrderDeps {
  assertSameOrigin(request: Request): Response | null;
  /** 5 / 600 с на IP; при сбое хранилища лимитов БРОСАЕТ (→ 500), запрос не пропускается. */
  limitOrders(request: Request): Promise<Response | null>;
  getSessionContext(): Promise<OrderSessionContext>;
  countActiveReservations(email: string, excludeClientRequestId: string): Promise<number>;
  createOrder(params: CreateOrderParams): Promise<CreatedOrder>;
  findOrderByClientRequestId(clientRequestId: string): Promise<CreatedOrder | null>;
  getOrderState(orderId: string): Promise<OrderStateRow | null>;
  getCartProducts(ids: string[], ctx: CatalogContext): Promise<CartProduct[]>;
  createPayment(orderId: string, opts: CreatePaymentOptions): Promise<CreatePaymentResult>;
  tokens: {
    orderToken(clientRequestId: string): string;
    hashOrderToken(token: string): string;
    orderPageUrl(orderNumber: string, token: string): string;
  };
  featureAtelier: boolean;
  now(): Date;
}

/** Повтор платежа при повторе запроса (Edge Case 1): pending-платёж моложе 10 минут переиспользуется. */
export const ORDER_PAYMENT_REUSE_SECONDS = 600;

/** create_order; deadlock / serialization / гонка уникальности — один повтор, затем исключение (→ 500). */
async function createWithRetry(deps: CreateOrderDeps, params: CreateOrderParams): Promise<CreatedOrder> {
  try {
    return await deps.createOrder(params);
  } catch (err) {
    if (!isRetryableDbError(err)) throw err;
    console.error({ scope: "orders.create.retry", clientRequestId: params.p_order.client_request_id, err });
    return await deps.createOrder(params);
  }
}

/** Ответ на бизнес-исключение create_order. Справочные данные (сумма, остаток, тип) — из каталога по уровню цены. */
async function failureResponse(f: CreateOrderFailure, body: CreateOrderBody, ctx: CatalogContext, deps: CreateOrderDeps) {
  const lookup = async (id: string): Promise<CartProduct | null> => {
    try {
      return (await deps.getCartProducts([id], ctx)).find((p) => p.id === id) ?? null;
    } catch (err) {
      console.error({ scope: "orders.create.lookup", productId: id, err });
      return null;
    }
  };
  switch (f.kind) {
    case "PRICE_CHANGED": {
      // actual_total — та же сумма, что покажет корзина (cart/validate) для этих позиций и этой сессии.
      const products = await deps.getCartProducts(body.items.map((i) => i.product_id), ctx);
      const v = buildCartValidation(body.items, products, isAtelierPricing(ctx, deps.featureAtelier) ? "atelier" : "retail");
      return priceChanged(body.expected_total, v.total);
    }
    case "OUT_OF_STOCK":
      return outOfStock(f.productId, (await lookup(f.productId))?.available_qty ?? 0);
    case "QTY_LIMIT":
      return qtyLimit(f.productId, (await lookup(f.productId))?.type ?? null);
    case "PRODUCT_UNAVAILABLE":
      return productUnavailable(f.productId);
    case "MIXED_KINDS":
      return mixedKinds();
    case "DUPLICATE_ITEMS":
      return orderValidationError({ items: ["Один товар — одна позиция"] }, "Один товар — одна позиция");
    case "EMPTY_CART":
      return orderValidationError({ items: ["Корзина пуста"] }, "Корзина пуста");
    case "TOO_MANY_LINES":
      return orderValidationError({ items: ["Не больше 10 позиций в заказе"] });
  }
}

async function handle(request: Request, deps: CreateOrderDeps): Promise<Response> {
  const forbidden = deps.assertSameOrigin(request);
  if (forbidden) return forbidden;
  const limited = await deps.limitOrders(request);
  if (limited) return limited;

  // Пустое или битое тело → null → 400 VALIDATION_ERROR с fields = {}.
  let raw: unknown = null;
  try {
    raw = JSON.parse(await request.text());
  } catch {
    raw = null;
  }
  const parsed = createOrderBody.safeParse(raw);
  if (!parsed.success) return orderValidationError(fieldErrorsByPath(parsed.error));
  const body = parsed.data;

  const session = await deps.getSessionContext();
  // BR-10/BR-20: цены ателье — только одобренному ателье и только при FEATURE_ATELIER.
  const atelierId = deps.featureAtelier ? session.atelierId : null;
  const ctx: CatalogContext = { atelierId };

  const pending = await deps.countActiveReservations(body.customer.email, body.client_request_id);
  if (pending >= MAX_PENDING_ORDERS_PER_EMAIL) return tooManyPendingOrders();

  // A28: токен детерминирован от client_request_id — повтор запроса даёт тот же токен к тому же хэшу.
  const token = deps.tokens.orderToken(body.client_request_id);
  const params = buildCreateOrderParams(body, { userId: session.userId, atelierId }, deps.tokens.hashOrderToken(token));

  let created: CreatedOrder;
  try {
    created = await createWithRetry(deps, params);
  } catch (err) {
    const failure = classifyCreateOrderError(err);
    if (!failure) throw err;
    // Два одинаковых запроса одновременно (двойной клик, Edge Case 1): второй ждёт блокировку строк товара и видит
    // бронь первого как OUT_OF_STOCK. Если заказ с этим client_request_id уже есть — это он, а не нехватка.
    const existing = failure.kind === "OUT_OF_STOCK" ? await deps.findOrderByClientRequestId(body.client_request_id) : null;
    if (!existing) return failureResponse(failure, body, ctx, deps);
    created = existing;
  }

  const orderUrl = deps.tokens.orderPageUrl(created.order_number, token);
  const state = await deps.getOrderState(created.order_id);
  if (!state) throw new Error(`orders.create: order ${created.order_id} not found after create_order`);
  const now = deps.now();
  const reservedUntil = state.reserved_until === null ? null : new Date(state.reserved_until);

  // Повтор запроса для заказа, который уже не ждёт оплаты: отменён / бронь истекла → оформить заново;
  // уже оплачен → вместо платёжной страницы ведём на страницу заказа.
  if (state.status === "cancelled" || (state.status === "pending_payment" && (reservedUntil === null || reservedUntil <= now))) {
    return orderNotPayable();
  }
  if (state.status !== "pending_payment") {
    return created201(created, (reservedUntil ?? now).toISOString(), orderUrl, orderUrl);
  }

  let payment: CreatePaymentResult;
  try {
    payment = await deps.createPayment(created.order_id, { reuseWithinSeconds: ORDER_PAYMENT_REUSE_SECONDS });
  } catch (err) {
    // Гонка: заказ отменён (бронь истекла) между проверкой выше и созданием платежа → 409, как при повторе.
    if (paymentOrderErrorCode(err) === "ORDER_NOT_PAYABLE") return orderNotPayable();
    if (paymentOrderErrorCode(err) === "ORDER_NOT_FOUND") throw err;
    payment = { ok: false, kind: "provider_unavailable", message: err instanceof Error ? err.message : String(err) };
    console.error({ scope: "orders.create.payment", orderId: created.order_id, err });
  }
  if (!payment.ok) {
    console.error({ scope: "orders.create.payment", orderId: created.order_id, kind: payment.kind, message: payment.message, yookassaCode: payment.yookassaCode });
    return orderPaymentProviderError(orderUrl);
  }
  return created201(created, (reservedUntil ?? now).toISOString(), payment.confirmationUrl, orderUrl);
}

function created201(o: CreatedOrder, reservedUntil: string, confirmationUrl: string, orderUrl: string) {
  const data: CreateOrderResponse = {
    order_id: o.order_id,
    order_number: o.order_number,
    total: o.order_total,
    total_formatted: formatRub(o.order_total),
    reserved_until: reservedUntil,
    confirmation_url: confirmationUrl,
    order_url: orderUrl,
  };
  return NextResponse.json({ data }, { status: 201 });
}

export function createCreateOrderHandler(deps: CreateOrderDeps) {
  return async function POST(request: Request): Promise<Response> {
    let res: Response;
    try {
      res = await handle(request, deps);
    } catch (err) {
      res = internalError("orders.create", err);
    }
    // Ответ содержит токен заказа и персональные данные: никогда не кэшируется, в том числе ошибки.
    res.headers.set("Cache-Control", PRIVATE_NO_STORE);
    return res;
  };
}
