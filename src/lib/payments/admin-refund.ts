import "server-only";
import { formatRub } from "@/lib/money";
import { UNPAID_ORDER_STATUSES, type OrderForPayment, type PaymentRow, type RefundRow } from "@/lib/payments/db-rows";
import { getDefaultPaymentsDeps, type PaymentsDeps } from "@/lib/payments/deps";
import { earliestRefund, pickPrimaryPayment } from "@/lib/payments/duplicates";
import { linesTotal, refundReceiptItems } from "@/lib/payments/receipt";
import { reconcileOrderPaymentsWith } from "@/lib/payments/reconcile";
import { refundTotals } from "@/lib/payments/refundable";
import { ADMIN_REUSE_WINDOW_MS, ADMIN_RETRYABLE_PREFIX, applyProviderRefund, refreshOrderRefunds } from "@/lib/payments/refund-refresh";
import { RESERVED_REFUND_REASON, type AdminRefundResponse } from "@/lib/schemas/admin-refund";
import { YookassaApiError, buildReceipt, type YookassaRefund } from "@/lib/yookassa";

// Ручной возврат из админки (Блок 3 «POST /api/admin/orders/[id]/refund», US-008, BR-16, BR-17, Edge Cases 38, 40).
// -1. Заказ pending_payment / cancelled → сверка платежей (reconcile.ts, бюджет REFUND_RECONCILE_BUDGET_MS), как в
//     GET /api/admin/orders/[id]. Заказ так и не оплачен, но есть succeeded-платёж или сверка не уложилась →
//     payment_unconfirmed (409): возврат до mark_order_paid дал бы paid при возвращённых деньгах.
//  0. Доводятся pending ручные возвраты заказа (refund-refresh.ts). Запрос без ответа ЮKassa моложе 5 минут → in_progress.
//  1. refundable = paid_amount − Σ refunds(pending|succeeded) (по одному платежу, refundable.ts), не больше суммы
//     позиций чека. amount > refundable → exceeds (422). restock = true вне BR-17 (preorder, delivered, сумма ≠ всему
//     остатку) → restock_not_allowed (400) — явный отказ вместо молчаливого игнора (Dialog такой запрос не шлёт).
//  2. Insert refunds (pending, created_by = админ). Исключение — повтор после сбоя связи: строка failed с пометкой
//     ADMIN_RETRYABLE_PREFIX той же суммы по тому же платежу (≤ 23 ч) снова становится pending, ключ refund_<id> тот же.
//     23505 (uq_refunds_duplicate_payment) → conflict (409). Два одновременных запроса: оформляет самый ранний pending
//     без ответа ЮKassa, остальные отменяются до обращения к ЮKassa → in_progress (повторный клик не создаёт второй возврат).
//  3. POST /v3/refunds с Idempotence-Key refund_<refund.id> и чеком (полный — все позиции, частичный — пропорционально).
//  4. succeeded → finalizeSucceededRefund (общий с webhook и сверкой); pending — ждём refund.succeeded;
//     canceled / 4xx → refunds failed + error_message → rejected (502); сеть / 5xx / таймаут → failed с пометкой → unavailable.

export const REFUND_DEADLINE_MS = 25_000;
export const RACE_LOSER_MESSAGE = "Повторный запрос: возврат уже оформляется, в ЮKassa не отправлялся";

export interface AdminRefundInput {
  orderId: string;
  amount: number;
  reason: string;
  restock: boolean;
  adminId: string;
}

export type AdminRefundOutcome =
  | { kind: "ok"; data: AdminRefundResponse }
  | { kind: "not_found" }
  | { kind: "exceeds"; refundable: number }
  | { kind: "in_progress" }
  | { kind: "conflict" }
  | { kind: "rejected"; description: string; code: string | null }
  | { kind: "unavailable" }
  /** Заказ pending_payment / cancelled, а оплата есть или не проверена (сверка не уложилась / не прошла). */
  | { kind: "payment_unconfirmed" }
  /** restock = true вне BR-17; partial — запрет только из-за неполной суммы. */
  | { kind: "restock_not_allowed"; message: string; partial: boolean };

export interface AdminRefundOptions {
  /** Сверка платежей заказа (по умолчанию reconcileOrderPaymentsWith — общий путь с webhook). */
  reconcile?: (orderId: string) => Promise<unknown>;
  /** Бюджет ожидания сверки, мс. */
  reconcileBudgetMs?: number;
}

/** Как ADMIN_RECONCILE_BUDGET_MS карточки заказа: 8 с сверки + 25 с POST /v3/refunds укладываются в maxDuration 60 с. */
export const REFUND_RECONCILE_BUDGET_MS = 8_000;
export const RESTOCK_PREORDER_MESSAGE = "Вернуть на склад можно только товар со склада, не под заказ";
export const RESTOCK_DELIVERED_MESSAGE = "Заказ доставлен: товар на склад не возвращается";
export const RESTOCK_PARTIAL_MESSAGE = "Вернуть на склад можно только при возврате всей суммы";
const UNPAID: ReadonlySet<string> = new Set<string>(UNPAID_ORDER_STATUSES);

const isManual = (r: RefundRow) => r.reason !== RESERVED_REFUND_REASON;

function isReusable(r: RefundRow, amount: number, nowMs: number): boolean {
  return r.status === "failed" && isManual(r) && r.amount === amount && !r.yookassa_refund_id
    && (r.error_message?.startsWith(ADMIN_RETRYABLE_PREFIX) ?? false) && nowMs - Date.parse(r.created_at) < ADMIN_REUSE_WINDOW_MS;
}

/** Строка возврата: переиспользованная после сбоя связи или новая; null — конфликт уникального индекса. */
async function claimRow(
  deps: PaymentsDeps, input: AdminRefundInput, target: PaymentRow, reusable: RefundRow | null,
): Promise<RefundRow | null> {
  const { reason, restock } = input;
  if (reusable) {
    await deps.repo.updateRefund(reusable.id, { status: "pending", error_message: null, reason, restock });
    return { ...reusable, status: "pending", error_message: null, reason, restock };
  }
  const ins = await deps.repo.insertRefund({
    order_id: input.orderId, payment_id: target.id, amount: input.amount, reason, restock, created_by: input.adminId,
  });
  return "conflict" in ins ? null : ins.row;
}

/** Гонка двух запросов без ответа ЮKassa: true — этот запрос проиграл, его строка уже снята. */
async function lostRace(deps: PaymentsDeps, row: RefundRow, reusable: RefundRow | null): Promise<boolean> {
  const inFlight = (await deps.repo.listOrderRefunds(row.order_id))
    .filter((r) => r.status === "pending" && isManual(r) && !r.yookassa_refund_id);
  const first = earliestRefund(inFlight);
  if (!first || first.id === row.id) return false;
  await deps.repo.updateRefund(row.id, reusable
    ? { status: "failed", error_message: reusable.error_message }
    : { status: "canceled", error_message: RACE_LOSER_MESSAGE });
  return true;
}

async function settlesWithin(task: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), ms); });
  try {
    return await Promise.race([task.then(() => true, () => true), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Заказ pending_payment / cancelled: webhook мог опоздать. Сверка (reconcile.ts, тот же путь, что webhook) — до расчёта
 * суммы, иначе возврат по succeeded-платежу + поздний mark_order_paid дали бы paid при возвращённых деньгах.
 * Возвращает актуальный заказ, null — заказ исчез, "unconfirmed" — деньги есть или могут быть, а заказ не оплачен.
 */
async function ensurePaidOrder(
  deps: PaymentsDeps, order: OrderForPayment, opts: AdminRefundOptions,
): Promise<OrderForPayment | null | "unconfirmed"> {
  if (!UNPAID.has(order.status)) return order;
  const reconcile = opts.reconcile ?? ((id: string) => reconcileOrderPaymentsWith(deps, id));
  const budget = opts.reconcileBudgetMs ?? REFUND_RECONCILE_BUDGET_MS;
  if (!(await settlesWithin(Promise.resolve().then(() => reconcile(order.id)), budget))) {
    console.error({ scope: "payments.adminRefund.reconcile", order_id: order.id, msg: "reconcile budget exceeded", budgetMs: budget });
    return "unconfirmed";
  }
  const fresh = await deps.repo.getOrder(order.id);
  if (!fresh || !UNPAID.has(fresh.status)) return fresh;
  // Оплата не учтена. Есть succeeded-платёж (сбой между ним и mark_order_paid, сверка ещё не прошла) → ждём;
  // нет — возвращать нечего (дальше refundable = 0 → REFUND_EXCEEDS_PAID).
  const payments = await deps.repo.listOrderPayments(order.id);
  return payments.some((p) => p.status === "succeeded" || p.status === "waiting_for_capture") ? "unconfirmed" : fresh;
}

/** BR-17: restock — только stock, не delivered и только полный остаток к возврату (restock_order возвращает ВСЕ позиции). */
function restockError(order: OrderForPayment, amount: number, refundable: number): string | null {
  if (order.kind !== "stock") return RESTOCK_PREORDER_MESSAGE;
  if (order.status === "delivered") return RESTOCK_DELIVERED_MESSAGE;
  if (amount !== refundable) return `${RESTOCK_PARTIAL_MESSAGE}: ${formatRub(refundable)}`;
  return null;
}

export async function createAdminRefundWith(
  deps: PaymentsDeps, input: AdminRefundInput, opts: AdminRefundOptions = {},
): Promise<AdminRefundOutcome> {
  const { repo } = deps;
  const read = await repo.getOrder(input.orderId);
  if (!read) return { kind: "not_found" };
  const order = await ensurePaidOrder(deps, read, opts);
  if (order === null) return { kind: "not_found" };
  if (order === "unconfirmed") return { kind: "payment_unconfirmed" };
  if ((await refreshOrderRefunds(deps, order.id)).inFlight) return { kind: "in_progress" };

  const [payments, refunds, items] = await Promise.all([
    repo.listOrderPayments(order.id), repo.listOrderRefunds(order.id), repo.getOrderItems(order.id),
  ]);
  const totals = refundTotals(payments, refunds);
  const refundable = UNPAID.has(order.status) ? 0 : Math.min(totals.refundable_amount, linesTotal(items));
  if (input.amount > refundable) return { kind: "exceeds", refundable };
  const restockMessage = input.restock ? restockError(order, input.amount, refundable) : null;
  if (restockMessage) return { kind: "restock_not_allowed", message: restockMessage, partial: order.kind === "stock" && order.status !== "delivered" };

  const candidates = payments.filter((p) => p.status === "succeeded" && (totals.by_payment.get(p.id) ?? 0) >= input.amount);
  const nowMs = deps.now().getTime();
  const reusable = earliestRefund(refunds.filter((r) => isReusable(r, input.amount, nowMs) && candidates.some((p) => p.id === r.payment_id)));
  const target = reusable ? candidates.find((p) => p.id === reusable.payment_id) : pickPrimaryPayment(candidates);
  if (!target) return { kind: "exceeds", refundable };

  // Чек — до записи в БД: сумма уже ≤ суммы позиций, ошибка здесь — ошибка кода (→ 500), а не «висящая» строка.
  const receipt = buildReceipt({ email: order.customer_email, phone: order.customer_phone, items: refundReceiptItems(items, input.amount) });
  const row = await claimRow(deps, input, target, reusable);
  if (!row) return { kind: "conflict" };
  if (await lostRace(deps, row, reusable)) return { kind: "in_progress" };

  let response: YookassaRefund;
  try {
    response = await deps.yookassa.createRefund({
      refundId: row.id, paymentId: target.yookassa_payment_id, amount: row.amount, description: `Возврат по заказу ${order.number}`, receipt,
    }, { deadlineMs: REFUND_DEADLINE_MS });
  } catch (err) {
    console.error({ scope: "payments.adminRefund", order_id: order.id, refund_id: row.id, err });
    if (err instanceof YookassaApiError) {
      const description = err.yookassa.description ?? `HTTP ${err.status}`;
      await repo.updateRefund(row.id, { status: "failed", error_message: description.slice(0, 500) });
      return { kind: "rejected", description, code: err.code ?? null };
    }
    const text = err instanceof Error ? err.message : String(err);
    await repo.updateRefund(row.id, { status: "failed", error_message: `${ADMIN_RETRYABLE_PREFIX}${text}`.slice(0, 500) });
    return { kind: "unavailable" };
  }

  const applied = await applyProviderRefund(deps, row, response);
  if (applied.status === "failed") return { kind: "rejected", description: applied.message, code: applied.code };
  const done = applied.status === "succeeded" ? applied.final : null;
  return {
    kind: "ok",
    data: {
      refund_id: row.id, yookassa_refund_id: response.id, status: applied.status, amount_formatted: formatRub(row.amount),
      order_status: done?.orderStatus ?? order.status, restocked: done?.restocked ?? false,
    },
  };
}

export async function createAdminRefund(input: AdminRefundInput): Promise<AdminRefundOutcome> {
  return createAdminRefundWith(await getDefaultPaymentsDeps(), input);
}
