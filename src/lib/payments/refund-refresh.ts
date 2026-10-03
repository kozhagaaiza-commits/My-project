import "server-only";
import type { RefundRow } from "@/lib/payments/db-rows";
import type { PaymentsDeps } from "@/lib/payments/deps";
import { ORPHAN_REFUND_AFTER_MS } from "@/lib/payments/duplicates";
import { finalizeSucceededRefund, type FinalizeRefundResult } from "@/lib/payments/refund-finalize";
import { RESERVED_REFUND_REASON } from "@/lib/schemas/admin-refund";
import type { YookassaRefund } from "@/lib/yookassa";

// Ответ ЮKassa по ручному возврату и доведение «зависших» ручных возвратов (автовозвраты повторной оплаты ведёт
// duplicates.ts — здесь они пропускаются).
//  - pending с yookassa_refund_id: GET /v3/refunds/{id} → succeeded (finalizeSucceededRefund) / canceled (failed).
//    У ЮKassa нет уведомления об отмене возврата: без этой проверки отменённый возврат вечно держал бы сумму
//    к возврату (pending входит в сумму, BR-16).
//  - pending без yookassa_refund_id старше 5 минут — процесс оборвался между insert и ответом ЮKassa. Строка → failed
//    с пометкой ADMIN_RETRYABLE_PREFIX: повтор админом той же суммы по тому же платежу (в пределах суток) переиспользует
//    ЭТУ строку и ключ refund_<id> — второй возврат не создаётся; если ЮKassa всё же провела первый запрос, webhook
//    refund.succeeded найдёт строку по платежу и сумме (refund-events.ts).
//  - моложе 5 минут — «в работе»: новый ручной возврат по заказу в это время не начинается (409).

/** failed после сбоя связи: запрос мог дойти до ЮKassa; повтор — только с тем же ключом refund_<id>. */
export const ADMIN_RETRYABLE_PREFIX = "Нет ответа ЮKassa, повторите возврат: ";
/** Ключ идемпотентности ЮKassa живёт 24 ч; после 23 ч строка с тем же ключом не переиспользуется. */
export const ADMIN_REUSE_WINDOW_MS = 23 * 3600_000;
const REFRESH_GET_DEADLINE_MS = 8000;

/** Тексты причин отмены возврата ЮKassa (cancellation_details.reason); неизвестная — код как есть. */
const CANCELLATION_TEXT: Record<string, string> = {
  insufficient_funds: "Недостаточно средств на балансе магазина",
  general_decline: "Отказ без объяснения причин",
  rejected_by_payee: "Эмитент платёжного средства отклонил возврат",
  yoo_money_account_closed: "Кошелёк ЮMoney покупателя закрыт",
};

export function cancellationText(reason: string | undefined): string {
  if (!reason) return "Возврат отменён";
  return CANCELLATION_TEXT[reason] ?? `Возврат отменён (${reason})`;
}

export type ProviderRefundApplied =
  | { status: "succeeded"; final: FinalizeRefundResult }
  | { status: "pending" }
  | { status: "failed"; message: string; code: string | null };

/** Ответ ЮKassa (POST или GET /v3/refunds) → строка refunds (Блок 3, шаги 4–5). */
export async function applyProviderRefund(deps: PaymentsDeps, row: RefundRow, r: YookassaRefund): Promise<ProviderRefundApplied> {
  if (r.status === "succeeded") return { status: "succeeded", final: await finalizeSucceededRefund(deps, row, r.id) };
  if (r.status === "pending") {
    await deps.repo.updateRefund(row.id, { status: "pending", yookassa_refund_id: r.id, error_message: null });
    return { status: "pending" };
  }
  const code = r.cancellation_details?.reason ?? null;
  const message = cancellationText(code ?? undefined);
  await deps.repo.updateRefund(row.id, { status: "failed", yookassa_refund_id: r.id, error_message: message.slice(0, 500) });
  return { status: "failed", message, code };
}

const isManual = (r: RefundRow) => r.reason !== RESERVED_REFUND_REASON;

export interface RefreshSummary {
  /** Ручной возврат без ответа ЮKassa моложе 5 минут — запрос ещё выполняется. */
  inFlight: boolean;
  checked: number;
  changed: number;
  errors: number;
}

/** Доводит pending-строки ручных возвратов (см. шапку). Не бросает: ошибки — в лог и в errors. */
export async function refreshRefundRows(deps: PaymentsDeps, list: RefundRow[]): Promise<RefreshSummary> {
  const out: RefreshSummary = { inFlight: false, checked: 0, changed: 0, errors: 0 };
  const nowMs = deps.now().getTime();
  for (const r of list) {
    if (r.status !== "pending" || !isManual(r)) continue;
    out.checked += 1;
    try {
      if (r.yookassa_refund_id) {
        const fresh = await deps.yookassa.getRefund(r.yookassa_refund_id, { deadlineMs: REFRESH_GET_DEADLINE_MS });
        if (fresh.status !== "pending") {
          await applyProviderRefund(deps, r, fresh);
          out.changed += 1;
        }
      } else if (nowMs - Date.parse(r.created_at) < ORPHAN_REFUND_AFTER_MS) {
        out.inFlight = true;
      } else {
        await deps.repo.updateRefund(r.id, { status: "failed", error_message: `${ADMIN_RETRYABLE_PREFIX}ответ на запрос возврата не получен` });
        out.changed += 1;
      }
    } catch (err) {
      out.errors += 1;
      console.error({ scope: "payments.refundRefresh", refund_id: r.id, err });
    }
  }
  return out;
}

/** Ручные возвраты одного заказа (перед новым возвратом; GET /api/admin/orders/[id] может вызвать перед расчётом сумм). */
export async function refreshOrderRefunds(deps: PaymentsDeps, orderId: string): Promise<RefreshSummary> {
  return refreshRefundRows(deps, await deps.repo.listOrderRefunds(orderId));
}

/** Cron (5.12 шаг 4): pending ручные возвраты за окно сверки. */
export async function refreshPendingRefundsSince(deps: PaymentsDeps, sinceIso: string): Promise<RefreshSummary> {
  return refreshRefundRows(deps, await deps.repo.listPendingRefundsSince(sinceIso));
}
