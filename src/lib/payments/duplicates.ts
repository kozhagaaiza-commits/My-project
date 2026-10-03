import "server-only";
import { formatRub, rubStringToKopecks } from "@/lib/money";
import type { OrderForPayment, OrderItemRow, PaymentRow, RefundRow } from "@/lib/payments/db-rows";
import type { PaymentsDeps } from "@/lib/payments/deps";
import { notifyAdminAttention, notifyCustomerRefund } from "@/lib/payments/notify";
import type { DuplicateRefundOutcome, ProcessResult } from "@/lib/payments/process-types";
import { refundReceiptItems } from "@/lib/payments/receipt";
import { YookassaApiError, buildReceipt, type YookassaPayment, type YookassaRefund } from "@/lib/yookassa";

// Повторная оплата заказа (Edge Case 36): mark_order_paid = already_paid, а у заказа есть ДРУГОЙ succeeded-платёж →
// полный автоматический возврат лишнего платежа (refunds: reason «Повторная оплата», restock = false), needs_attention,
// admin_attention.
//  - Основной платёж (остаётся) — самый ранний по captured_at, затем created_at, id: повторная доставка уведомления по
//    первому платежу не вернёт и его. Платежи, ещё pending в нашей БД, уточняются GET (их обработчик мог не дойти до
//    перевода строки в succeeded: строка обновляется ПОСЛЕ mark_order_paid).
//  - Гонка обработчиков: с индексом uq_refunds_duplicate_payment второй insert даёт 23505 → «уже оформляется».
//    Без индекса: после insert строки перечитываются; оформляет самая ранняя (created_at, id), остальные помечаются
//    canceled с другой причиной (не мешают будущему индексу) и в ЮKassa не уходят.
//  - admin_attention — сразу после insert; при окончательной неудаче — второй «Верните вручную».
//  - Строка pending без yookassa_refund_id старше 5 минут (процесс упал между insert и POST) — повтор с тем же refund_<id>.
//  - failed после сети/5xx — ОДИН автоповтор с тем же ключом при следующей обработке; после 4xx — только вручную.

export const DUPLICATE_REFUND_REASON = "Повторная оплата";
export const DUPLICATE_LOSER_REASON = "Повторная оплата — дубликат записи, в ЮKassa не отправлялся";
export const ORPHAN_REFUND_AFTER_MS = 5 * 60_000;
export const RETRYABLE_PREFIX = "Сбой связи с ЮKassa, будет автоповтор: ";
export const RETRY_FAILED_PREFIX = "Сбой связи с ЮKassa, автоповтор не помог: ";

interface Target { row: PaymentRow; amount: number; capturedAt: string | null }
interface OrderCtx { load(): Promise<{ order: OrderForPayment; items: OrderItemRow[] }> }

export function orderCtx(deps: PaymentsDeps, orderId: string): OrderCtx {
  let p: Promise<{ order: OrderForPayment; items: OrderItemRow[] }> | null = null;
  return {
    load: () => (p ??= (async () => {
      const order = await deps.repo.getOrder(orderId);
      if (!order) throw new Error(`payments.duplicates: заказ ${orderId} не найден`);
      return { order, items: await deps.repo.getOrderItems(orderId) };
    })()),
  };
}

/** Ключ сортировки timestamptz с микросекундами (Date.parse их отбрасывает). */
function tsKey(s: string | null): [number, string] {
  const t = s ? Date.parse(s) : NaN;
  if (Number.isNaN(t)) return [Number.POSITIVE_INFINITY, ""];
  return [t, (/\.(\d+)/.exec(s ?? "")?.[1] ?? "").padEnd(6, "0")];
}
function cmpTs(a: string | null, b: string | null): number {
  const [x, xf] = tsKey(a);
  const [y, yf] = tsKey(b);
  return x !== y ? (x < y ? -1 : 1) : xf.localeCompare(yf);
}

/** Основной платёж среди succeeded: самый ранний captured_at, затем created_at, затем id. */
export function pickPrimaryPayment<T extends Pick<PaymentRow, "captured_at" | "created_at" | "yookassa_payment_id">>(list: T[]): T | null {
  return [...list].sort((a, b) => cmpTs(a.captured_at, b.captured_at) || cmpTs(a.created_at, b.created_at)
    || a.yookassa_payment_id.localeCompare(b.yookassa_payment_id))[0] ?? null;
}

/** Самая ранняя строка возврата (created_at, id) — «владелец» возврата при гонке без индекса. */
export function earliestRefund(list: RefundRow[]): RefundRow | null {
  return [...list].sort((a, b) => cmpTs(a.created_at, b.created_at) || a.id.localeCompare(b.id))[0] ?? null;
}

const isActiveDuplicate = (r: RefundRow) => r.reason === DUPLICATE_REFUND_REASON && r.status !== "canceled";
const errorText = (err: unknown) =>
  err instanceof YookassaApiError ? (err.yookassa.description ?? `HTTP ${err.status}`) : err instanceof Error ? err.message : String(err);

async function quietGet<T>(fn: () => Promise<T>, scope: string, id: string): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error({ scope, id, err });
    return null;
  }
}

async function ensureAttention(deps: PaymentsDeps, order: OrderForPayment, t: Target) {
  const pid = t.row.yookassa_payment_id;
  if ((await deps.repo.getAttentionReason(order.id))?.includes(pid)) return;
  const amount = formatRub(t.amount);
  await deps.repo.flagOrderAttention(order.id, `Повторная оплата: платёж ${pid}, автоматический возврат ${amount}`);
  await notifyAdminAttention(deps, order, "duplicate_payment", `Повторная оплата: оформляется автоматический возврат ${amount} (платёж ${pid})`);
}

async function manualFailure(deps: PaymentsDeps, ctx: OrderCtx, t: Target, refund: RefundRow, message: string, ykId?: string): Promise<DuplicateRefundOutcome> {
  await deps.repo.updateRefund(refund.id, { status: "failed", error_message: message.slice(0, 500), ...(ykId ? { yookassa_refund_id: ykId } : {}) });
  const { order } = await ctx.load();
  await notifyAdminAttention(deps, order, "duplicate_payment",
    `Повторная оплата: автоматический возврат ${formatRub(t.amount)} не прошёл (${message}). Верните вручную (платёж ${t.row.yookassa_payment_id})`);
  return { payment_id: t.row.yookassa_payment_id, refund_id: refund.id, status: "failed" };
}

async function applyRefundResponse(deps: PaymentsDeps, ctx: OrderCtx, t: Target, refund: RefundRow, r: YookassaRefund): Promise<DuplicateRefundOutcome> {
  const base = { payment_id: t.row.yookassa_payment_id, refund_id: refund.id };
  if (r.status === "succeeded") {
    if (await deps.repo.markRefundSucceeded(refund.id, r.id)) await notifyCustomerRefund(deps, (await ctx.load()).order, refund.amount);
    return { ...base, status: "succeeded" };
  }
  if (r.status === "pending") {
    await deps.repo.updateRefund(refund.id, { status: "pending", yookassa_refund_id: r.id });
    return { ...base, status: "pending" };
  }
  return manualFailure(deps, ctx, t, refund, r.cancellation_details?.reason ?? "ЮKassa отменила возврат", r.id);
}

/** POST /v3/refunds с Idempotence-Key refund_<refund.id> (повтор — тем же ключом) и чеком. */
async function sendRefund(deps: PaymentsDeps, ctx: OrderCtx, t: Target, refund: RefundRow, isRetry: boolean): Promise<DuplicateRefundOutcome> {
  const { order, items } = await ctx.load();
  let receipt;
  try {
    receipt = buildReceipt({ email: order.customer_email, phone: order.customer_phone, items: refundReceiptItems(items, refund.amount) });
  } catch (err) {
    return manualFailure(deps, ctx, t, refund, errorText(err));
  }
  let response: YookassaRefund;
  try {
    response = await deps.yookassa.createRefund({
      refundId: refund.id, paymentId: t.row.yookassa_payment_id, amount: refund.amount,
      description: `Возврат по заказу ${order.number}`, receipt,
    });
  } catch (err) {
    console.error({ scope: "payments.duplicateRefund", order_number: order.number, refund_id: refund.id, retry: isRetry, err });
    if (err instanceof YookassaApiError) return manualFailure(deps, ctx, t, refund, errorText(err));
    if (isRetry) return manualFailure(deps, ctx, t, refund, RETRY_FAILED_PREFIX + errorText(err));
    await deps.repo.updateRefund(refund.id, { status: "failed", error_message: (RETRYABLE_PREFIX + errorText(err)).slice(0, 500) });
    return { payment_id: t.row.yookassa_payment_id, refund_id: refund.id, status: "retry_scheduled" };
  }
  return applyRefundResponse(deps, ctx, t, refund, response);
}

async function startDuplicateRefund(deps: PaymentsDeps, ctx: OrderCtx, orderId: string, t: Target): Promise<DuplicateRefundOutcome> {
  const pid = t.row.yookassa_payment_id;
  const ins = await deps.repo.insertRefund({ order_id: orderId, payment_id: t.row.id, amount: t.amount, reason: DUPLICATE_REFUND_REASON, restock: false });
  if ("conflict" in ins) return { payment_id: pid, refund_id: null, status: "in_progress" }; // индекс: оформляет другой
  const winner = earliestRefund((await deps.repo.listPaymentRefunds(t.row.id)).filter(isActiveDuplicate));
  if (winner && winner.id !== ins.row.id) {
    await deps.repo.updateRefund(ins.row.id, { status: "canceled", reason: DUPLICATE_LOSER_REASON, error_message: "Возврат уже оформляет другой обработчик" });
    return { payment_id: pid, refund_id: winner.id, status: "in_progress" };
  }
  await ensureAttention(deps, (await ctx.load()).order, t);
  return sendRefund(deps, ctx, t, ins.row, false);
}

/** Довести существующий автоматический возврат. null — делать нечего (завершён или только вручную). */
export async function resumeDuplicateRefund(deps: PaymentsDeps, ctx: OrderCtx, t: Target, r: RefundRow): Promise<DuplicateRefundOutcome | null> {
  const pid = t.row.yookassa_payment_id;
  if (r.status === "pending" && r.yookassa_refund_id) {
    const ykId = r.yookassa_refund_id;
    const fresh = await quietGet(() => deps.yookassa.getRefund(ykId), "payments.duplicateRefund.get", ykId);
    if (!fresh || fresh.status === "pending") return { payment_id: pid, refund_id: r.id, status: "pending" };
    return applyRefundResponse(deps, ctx, t, r, fresh);
  }
  if (r.status === "pending") {
    if (deps.now().getTime() - Date.parse(r.created_at) < ORPHAN_REFUND_AFTER_MS) return { payment_id: pid, refund_id: r.id, status: "in_progress" };
    await ensureAttention(deps, (await ctx.load()).order, t); // процесс мог упасть до admin_attention
    return sendRefund(deps, ctx, t, r, false);
  }
  if (r.status === "failed" && r.error_message?.startsWith(RETRYABLE_PREFIX)) return sendRefund(deps, ctx, t, r, true);
  return null;
}

async function settleTarget(deps: PaymentsDeps, ctx: OrderCtx, orderId: string, t: Target): Promise<DuplicateRefundOutcome | null> {
  const refunds = await deps.repo.listPaymentRefunds(t.row.id);
  const active = earliestRefund(refunds.filter(isActiveDuplicate));
  if (active) return resumeDuplicateRefund(deps, ctx, t, active);
  // По платежу уже есть возврат из админки — автоматически не трогаем.
  if (refunds.some((r) => r.status === "pending" || r.status === "succeeded")) return null;
  return startDuplicateRefund(deps, ctx, orderId, t);
}

/** mark_order_paid вернул already_paid для платежа current (объект из GET ЮKassa, status = succeeded). */
export async function handleAlreadyPaid(deps: PaymentsDeps, orderId: string, current: YookassaPayment): Promise<ProcessResult> {
  const succeeded: Target[] = [];
  for (const row of await deps.repo.listOrderPayments(orderId)) {
    if (row.yookassa_payment_id === current.id) {
      succeeded.push({ row, amount: rubStringToKopecks(current.amount.value), capturedAt: current.captured_at ?? row.captured_at });
    } else if (row.status === "succeeded") {
      succeeded.push({ row, amount: row.amount, capturedAt: row.captured_at });
    } else if (row.status === "pending" || row.status === "waiting_for_capture") {
      const fresh = await quietGet(() => deps.yookassa.getPayment(row.yookassa_payment_id), "payments.duplicates.get", row.yookassa_payment_id);
      if (fresh?.status === "succeeded" && fresh.amount.currency === "RUB") {
        succeeded.push({ row, amount: rubStringToKopecks(fresh.amount.value), capturedAt: fresh.captured_at ?? null });
      }
    }
  }
  if (succeeded.length < 2) return { kind: "already_paid", orderId };

  const primary = pickPrimaryPayment(succeeded.map((t) => ({ ...t.row, captured_at: t.capturedAt })));
  const ctx = orderCtx(deps, orderId);
  const outcomes: DuplicateRefundOutcome[] = [];
  for (const t of succeeded) {
    if (t.row.id === primary?.id) continue;
    const o = await settleTarget(deps, ctx, orderId, t);
    if (o) outcomes.push(o);
  }
  return outcomes.length ? { kind: "refunded_duplicate", orderId, refunds: outcomes } : { kind: "already_paid", orderId };
}

/** Сверка cron: незавершённые автоматические возвраты (сироты pending, failed после сети/5xx, pending в ЮKassa). */
export async function resumeOpenDuplicateRefunds(deps: PaymentsDeps, sinceIso: string): Promise<DuplicateRefundOutcome[]> {
  const open = await deps.repo.listOpenRefundsByReason(DUPLICATE_REFUND_REASON, sinceIso);
  const byPayment = new Map<string, RefundRow[]>();
  for (const r of open) byPayment.set(r.payment_id, [...(byPayment.get(r.payment_id) ?? []), r]);
  const out: DuplicateRefundOutcome[] = [];
  for (const [paymentId, list] of byPayment) {
    try {
      const row = await deps.repo.findPaymentById(paymentId);
      const r = earliestRefund(list);
      if (!row || !r) continue;
      const o = await resumeDuplicateRefund(deps, orderCtx(deps, r.order_id), { row, amount: r.amount, capturedAt: row.captured_at }, r);
      if (o) out.push(o);
    } catch (err) {
      console.error({ scope: "payments.resumeDuplicateRefunds", payment_id: paymentId, err });
    }
  }
  return out;
}
