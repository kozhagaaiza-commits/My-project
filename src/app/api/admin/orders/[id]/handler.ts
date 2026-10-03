import type { AdminApiAuth } from "@/lib/admin/api-guard";
import {
  adminInternalError, adminOk, adminOrderNotFound, adminValidationError, noStore, orderConflict, readJsonBody,
} from "@/lib/admin/http";
import { patchOrderMeta, type MetaPatchDeps } from "@/lib/admin/meta-patch";
import { buildAdminOrderDetail } from "@/lib/admin/order-view";
import type { AdminOrderDetailData } from "@/lib/admin/orders-db";
import { adminOrderParams, orderMetaPatchBody } from "@/lib/schemas/admin-orders";

// GET /api/admin/orders/[id] и PATCH /api/admin/orders/[id] (Блок 3). Зависимости внедряются (route.ts — реальные).
// GET: admin → id (не uuid → 404) → ленивая отмена броней → карточка → для pending_payment / cancelled сверка платежей
//      (5.9.1, A35) и доводка pending-возвратов (бюджет ожидания, остаток — после ответа) → повторное чтение → { data }.
//      Суммы — refundTotals() (src/lib/payments/refundable.ts), как в проверке POST …/refund.
// PATCH: admin + Origin → id → Zod тела → patchOrderMeta (оптимистическая блокировка) → { data }.

export interface OrderRouteContext {
  params: Promise<{ id: string }>;
}

export interface GetAdminOrderDeps {
  authorize(request: Request): Promise<AdminApiAuth>;
  cancelExpiredOrders(): Promise<number>;
  loadDetail(orderId: string): Promise<AdminOrderDetailData | null>;
  /** src/lib/payments/reconcile.ts — не бросает (страховка всё равно есть). */
  reconcileOrderPayments(orderId: string): Promise<unknown>;
  /** refreshOrderRefunds (src/lib/payments/refund-refresh.ts): довести pending-возвраты до итогового статуса в ЮKassa. */
  refreshOrderRefunds?(orderId: string): Promise<unknown>;
  /** Бюджет ожидания сверки, мс. */
  reconcileBudgetMs?: number;
  /** Сверка не уложилась в бюджет: доделать после ответа (after()). */
  continueAfterResponse?(task: Promise<unknown>): void;
}

export const ADMIN_RECONCILE_BUDGET_MS = 8_000;
const RECONCILE_STATUSES: ReadonlySet<string> = new Set(["pending_payment", "cancelled"]);

async function settlesWithin(task: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), ms); });
  try {
    return await Promise.race([task.then(() => true, () => true), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function handleGet(request: Request, routeCtx: OrderRouteContext, deps: GetAdminOrderDeps): Promise<Response> {
  const auth = await deps.authorize(request);
  if (!auth.ok) return auth.response;
  const params = adminOrderParams.safeParse(await routeCtx.params);
  if (!params.success) return adminOrderNotFound();
  const orderId = params.data.id;

  try {
    await deps.cancelExpiredOrders();
  } catch (err) {
    console.error({ scope: "admin.orders.get.cancelExpired", orderId, err });
  }

  let data = await deps.loadDetail(orderId);
  if (data === null) return adminOrderNotFound();

  // Сверка оплаты (pending_payment / cancelled) и доводка pending-возвратов — до расчёта сумм, общий бюджет ожидания.
  const jobs: Array<{ scope: string; run: () => Promise<unknown> }> = [];
  if (RECONCILE_STATUSES.has(data.order.status)) {
    jobs.push({ scope: "admin.orders.get.reconcile", run: () => deps.reconcileOrderPayments(orderId) });
  }
  const refresh = deps.refreshOrderRefunds;
  if (refresh && data.refunds.some((r) => r.status === "pending")) {
    jobs.push({ scope: "admin.orders.get.refunds", run: () => refresh(orderId) });
  }
  if (jobs.length > 0) {
    const task = Promise.all(jobs.map((j) => Promise.resolve()
      .then(j.run)
      .catch((err: unknown) => { console.error({ scope: j.scope, orderId, err }); })));
    const budget = deps.reconcileBudgetMs ?? ADMIN_RECONCILE_BUDGET_MS;
    if (await settlesWithin(task, budget)) {
      data = (await deps.loadDetail(orderId)) ?? data;
    } else {
      console.error({ scope: "admin.orders.get.reconcile", orderId, msg: "reconcile budget exceeded", budgetMs: budget });
      deps.continueAfterResponse?.(task);
    }
  }
  return adminOk(buildAdminOrderDetail(data));
}

export interface PatchAdminOrderDeps extends MetaPatchDeps {
  authorize(request: Request): Promise<AdminApiAuth>;
}

async function handlePatch(request: Request, routeCtx: OrderRouteContext, deps: PatchAdminOrderDeps): Promise<Response> {
  const auth = await deps.authorize(request);
  if (!auth.ok) return auth.response;
  const params = adminOrderParams.safeParse(await routeCtx.params);
  if (!params.success) return adminOrderNotFound();

  const body = orderMetaPatchBody.safeParse(await readJsonBody(request));
  if (!body.success) return adminValidationError(body.error);

  const result = await patchOrderMeta(deps, { orderId: params.data.id, body: body.data });
  if (result.kind === "not_found") return adminOrderNotFound();
  if (result.kind === "conflict") return orderConflict();
  return adminOk(result.data);
}

export function createGetAdminOrderHandler(deps: GetAdminOrderDeps) {
  return async function GET(request: Request, routeCtx: OrderRouteContext): Promise<Response> {
    try {
      return noStore(await handleGet(request, routeCtx, deps));
    } catch (err) {
      return noStore(adminInternalError("admin.orders.get", err));
    }
  };
}

export function createPatchAdminOrderHandler(deps: PatchAdminOrderDeps) {
  return async function PATCH(request: Request, routeCtx: OrderRouteContext): Promise<Response> {
    try {
      return noStore(await handlePatch(request, routeCtx, deps));
    } catch (err) {
      return noStore(adminInternalError("admin.orders.patch", err));
    }
  };
}
