import "server-only";
import { after } from "next/server";
import { env } from "@/lib/env";
import { reconcileOrderPayments } from "@/lib/payments/reconcile";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderView } from "@/types/order-view";
import { ORDER_TOKEN_RE, verifyOrderAccess, type OrderSessionContext } from "./access";
import { rpcCancelExpiredOrders, selectOrderForAccess, type OrderAccessRow } from "./db";
import { buildOrderView, type OrderViewData } from "./view";
import { loadOrderViewData } from "./view-db";

// Заказ для страницы статуса — общая функция Route Handler GET /api/orders/[number] и Server Component /orders/[number]
// (Блок 3; 5.9.1 «Сверка»; 5.10; Edge Cases 3, 4, 22, 43). Порядок:
//  1. verifyOrderAccess: токен ИЛИ владелец ИЛИ admin. Нет заказа, неверный номер, неверный или битый токен —
//     ОДИН результат { kind: "not_found" } (→ одинаковый 404, перебор номеров ничего не даёт).
//  2. cancel_expired_orders() — ленивая отмена ДО чтения данных страницы; сбой логируется и не роняет запрос.
//  3. Заказ был в pending_payment / cancelled → сверка платежей (webhook мог не дойти; оплата после истечения брони
//     принимается). reconcileOrderPayments не бросает; на сверку — бюджет времени, остаток доделывается после ответа.
//  4. Чтение данных страницы (service-role, явные колонки) ПОСЛЕ отмены и сверки — повторное чтение не нужно,
//     статус уже итоговый. → buildOrderView.

export type GetOrderViewResult = { kind: "ok"; view: OrderView } | { kind: "not_found" };

export interface GetOrderViewInput {
  number: string;
  /** ?t= из ссылки; null/undefined — без токена. Битый формат — not_found, как и неверный токен. */
  token?: string | null;
  ctx: Pick<OrderSessionContext, "userId" | "role">;
}

export interface GetOrderViewDeps {
  selectOrderForAccess(number: string): Promise<OrderAccessRow | null>;
  /** rpc cancel_expired_orders(). */
  cancelExpiredOrders(): Promise<number>;
  /** src/lib/payments/reconcile.ts — не бросает (страховка try/catch всё равно есть). */
  reconcileOrderPayments(orderId: string): Promise<unknown>;
  loadOrderViewData(orderId: string): Promise<OrderViewData | null>;
  telegramBotUsername: string;
  now(): Date;
  /** Бюджет ожидания сверки, мс (по умолчанию RECONCILE_BUDGET_MS). */
  reconcileBudgetMs?: number;
  /** Сверка не уложилась в бюджет: продолжить после ответа (next/server after()). */
  continueAfterResponse?(task: Promise<unknown>): void;
}

/** Статусы, при которых страница сверяет платежи (A35: pending_payment и cancelled). */
export const RECONCILE_ORDER_STATUSES: ReadonlySet<string> = new Set(["pending_payment", "cancelled"]);
/**
 * Ожидание сверки внутри запроса. Вызов ЮKassa без дедлайна — до 3 попыток по 15 с, больше maxDuration маршрута (30 с):
 * страница не должна висеть. Не уложилась — ответ по текущим данным, сверка продолжается в after().
 */
export const RECONCILE_BUDGET_MS = 8_000;

const NOT_FOUND: GetOrderViewResult = { kind: "not_found" };

async function settlesWithin(task: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), ms); });
  try {
    return await Promise.race([task.then(() => true, () => true), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function getOrderViewWith(deps: GetOrderViewDeps, input: GetOrderViewInput): Promise<GetOrderViewResult> {
  const rawToken = input.token ?? null;
  if (rawToken !== null && !ORDER_TOKEN_RE.test(rawToken)) return NOT_FOUND;

  const access = await verifyOrderAccess(
    { number: input.number, token: rawToken, ctx: input.ctx, allowAdmin: true },
    { selectOrder: deps.selectOrderForAccess },
  );
  if (!access.found) return NOT_FOUND;
  const orderId = access.order.id;

  try {
    await deps.cancelExpiredOrders();
  } catch (err) {
    console.error({ scope: "orders.view.cancelExpired", orderId, err });
  }

  if (RECONCILE_ORDER_STATUSES.has(access.order.status)) {
    const task = Promise.resolve()
      .then(() => deps.reconcileOrderPayments(orderId))
      .catch((err: unknown) => { console.error({ scope: "orders.view.reconcile", orderId, err }); });
    const budget = deps.reconcileBudgetMs ?? RECONCILE_BUDGET_MS;
    if (!(await settlesWithin(task, budget))) {
      console.error({ scope: "orders.view.reconcile", orderId, msg: "reconcile budget exceeded", budgetMs: budget });
      deps.continueAfterResponse?.(task);
    }
  }

  const data = await deps.loadOrderViewData(orderId);
  if (data === null) return NOT_FOUND;
  return {
    kind: "ok",
    view: buildOrderView({
      ...data,
      now: deps.now(),
      accessToken: access.via === "token" ? rawToken : null,
      telegramBotUsername: deps.telegramBotUsername,
    }),
  };
}

function defaultDeps(): GetOrderViewDeps {
  return {
    selectOrderForAccess: (number) => selectOrderForAccess(createAdminClient(), number),
    cancelExpiredOrders: () => rpcCancelExpiredOrders(createAdminClient()),
    reconcileOrderPayments,
    loadOrderViewData: (orderId) => loadOrderViewData(createAdminClient(), orderId),
    telegramBotUsername: env.TELEGRAM_BOT_USERNAME,
    now: () => new Date(),
    continueAfterResponse: (task) => after(() => task),
  };
}

/** Для Route Handler и Server Component: ctx — getOrderSessionContext(). Ошибки БД пробрасываются (→ 500 / error.tsx). */
export function getOrderView(input: GetOrderViewInput): Promise<GetOrderViewResult> {
  return getOrderViewWith(defaultDeps(), input);
}
