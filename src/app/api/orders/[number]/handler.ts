import { NextResponse } from "next/server";
import { PRIVATE_NO_STORE, internalError, queryObject } from "@/lib/catalog/http";
import type { OrderSessionContext } from "@/lib/orders/access";
import type { GetOrderViewInput, GetOrderViewResult } from "@/lib/orders/get-view";
import { orderNotFound } from "@/lib/orders/responses";
import { orderParams, orderTokenQuery } from "@/lib/schemas/orders";
import type { OrderView } from "@/types/order-view";

// Тело GET /api/orders/[number]?t=<token> (Блок 3; US-004, US-005; 5.9.1 «Сверка»; 5.10; Edge Cases 3, 4, 22, 43).
// Порядок: rate limit 30/60 с на IP (fail-closed) → Zod номера и токена → сессия → getOrderView → 200 { data }.
// Невалидный номер или токен — тот же 404 «Заказ не найден», что и «нет заказа» / «неверный токен» (не 400:
// ответ не должен отличаться, A39). Cache-Control: private, no-store на всех ответах (в ответе ПДн и ссылка с токеном).

export interface GetOrderDeps {
  /** 30 / 60 с на IP (order:<ip>); сбой хранилища лимитов — БРОСАЕТ (→ 500). */
  limitOrderRead(request: Request): Promise<Response | null>;
  getSessionContext(): Promise<OrderSessionContext>;
  getOrderView(input: GetOrderViewInput): Promise<GetOrderViewResult>;
}

export interface OrderRouteContext {
  params: Promise<{ number: string }>;
}

async function handle(request: Request, routeCtx: OrderRouteContext, deps: GetOrderDeps): Promise<Response> {
  const limited = await deps.limitOrderRead(request);
  if (limited) return limited;

  const params = orderParams.safeParse(await routeCtx.params);
  const query = orderTokenQuery.safeParse(queryObject(request.url));
  if (!params.success || !query.success) return orderNotFound();

  const session = await deps.getSessionContext();
  const result = await deps.getOrderView({ number: params.data.number, token: query.data.t ?? null, ctx: session });
  if (result.kind === "not_found") return orderNotFound();
  const data: OrderView = result.view;
  return NextResponse.json({ data });
}

export function createGetOrderHandler(deps: GetOrderDeps) {
  return async function GET(request: Request, routeCtx: OrderRouteContext): Promise<Response> {
    let res: Response;
    try {
      res = await handle(request, routeCtx, deps);
    } catch (err) {
      res = internalError("orders.get", err);
    }
    res.headers.set("Cache-Control", PRIVATE_NO_STORE);
    return res;
  };
}
