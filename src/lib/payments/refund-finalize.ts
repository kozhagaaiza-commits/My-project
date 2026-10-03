import "server-only";
import { formatRub } from "@/lib/money";
import type { OrderForPayment, OrderStatus, RefundRow } from "@/lib/payments/db-rows";
import type { PaymentsDeps } from "@/lib/payments/deps";
import { notifyCustomerRefund } from "@/lib/payments/notify";
import { isFullyRefunded, refundTotals } from "@/lib/payments/refundable";

// Единое завершение возврата, подтверждённого ЮKassa (status = succeeded в ответе НАШЕГО запроса POST/GET /v3/refunds).
// Вызывают: ручной возврат из админки (Блок 3, шаг 4), webhook refund.succeeded и сверка (refund-events.ts),
// автоматический возврат повторной оплаты (duplicates.ts), cron (refund-refresh.ts).
//  1. refunds.status → succeeded условным update (neq succeeded). Кто перевёл — тот и делает шаги 2–4 (A35: ровно одно
//     уведомление; restock не повторится при повторной доставке webhook). Не перевёл — ничего не делает.
//  2. Сумма succeeded-возвратов = оплате → заказ refunded + order_status_history (changed_by = автор возврата; для
//     автоматических — null) условным update по прочитанному статусу (переход делает один из параллельных обработчиков).
//  3. restock (BR-17): только если ЭТОТ возврат перевёл заказ в refunded, у возврата restock = true, kind = 'stock'
//     и заказ не был delivered. restock_order возвращает на склад ВСЕ позиции заказа, поэтому при частичном возврате
//     остаток не трогается (иначе двойной возврат на склад при двух частичных возвратах).
//  4. customer_refund (email + Telegram при подписке).
// Деньги уже возвращены: сбой шагов 2–4 не бросает исключение (повтор не поможет — шаг 1 уже сделан), а ставит заказу
// needs_attention с причиной; ошибка — в лог. Бросает только сбой шага 1 (→ 500 webhook, ЮKassa повторит).

/** Статусы, из которых полный возврат переводит заказ в refunded («из любого статуса после paid», Блок 5). */
export const REFUNDABLE_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "paid", "confirmed", "ordered_from_supplier", "in_transit", "arrived", "shipped", "delivered",
]);

export interface FinalizeRefundResult {
  /** false — возврат уже был succeeded (обработал другой вызов), шаги 2–4 не выполнялись. */
  flipped: boolean;
  /** Статус заказа после обработки (null — заказ не прочитан). */
  orderStatus: OrderStatus | null;
  restocked: boolean;
}

async function flagQuietly(deps: PaymentsDeps, orderId: string, reason: string) {
  try {
    await deps.repo.flagOrderAttention(orderId, reason);
  } catch (err) {
    console.error({ scope: "payments.refundFinalize", msg: "needs_attention не поставлен", order_id: orderId, reason, err });
  }
}

/** Шаги 2–3. Возвращает новый статус и факт возврата на склад; сбои — needs_attention. */
async function settleOrder(deps: PaymentsDeps, order: OrderForPayment, row: RefundRow): Promise<{ status: OrderStatus; restocked: boolean }> {
  const { repo } = deps;
  const amount = formatRub(row.amount);
  let transitioned = false;
  try {
    const [payments, refunds] = await Promise.all([repo.listOrderPayments(order.id), repo.listOrderRefunds(order.id)]);
    if (!isFullyRefunded(refundTotals(payments, refunds)) || !REFUNDABLE_ORDER_STATUSES.has(order.status)) {
      return { status: order.status, restocked: false };
    }
    transitioned = await repo.markOrderRefunded(order.id, order.status, row.created_by ?? null, `Возврат ${amount}: ${row.reason}`);
    if (!transitioned) return { status: (await repo.getOrder(order.id))?.status ?? order.status, restocked: false };
  } catch (err) {
    console.error({ scope: "payments.refundFinalize", msg: "заказ не переведён в refunded", order_id: order.id, refund_id: row.id, err });
    await flagQuietly(deps, order.id, `Возврат ${amount} проведён ЮKassa, статус заказа не обновлён — проверьте вручную`);
    return { status: order.status, restocked: false };
  }
  if (!(row.restock === true && order.kind === "stock" && order.status !== "delivered")) return { status: "refunded", restocked: false };
  try {
    await repo.restockOrder(order.id);
    return { status: "refunded", restocked: true };
  } catch (err) {
    console.error({ scope: "payments.refundFinalize", msg: "restock_order не выполнен", order_id: order.id, refund_id: row.id, err });
    await flagQuietly(deps, order.id, "Возврат проведён, остаток на склад не возвращён — верните вручную");
    return { status: "refunded", restocked: false };
  }
}

export async function finalizeSucceededRefund(deps: PaymentsDeps, row: RefundRow, yookassaRefundId: string): Promise<FinalizeRefundResult> {
  const flipped = await deps.repo.markRefundSucceeded(row.id, yookassaRefundId);
  let order: OrderForPayment | null = null;
  try {
    order = await deps.repo.getOrder(row.order_id);
  } catch (err) {
    console.error({ scope: "payments.refundFinalize", msg: "заказ не прочитан", refund_id: row.id, err });
  }
  if (!flipped || !order) {
    if (flipped) await flagQuietly(deps, row.order_id, `Возврат ${formatRub(row.amount)} проведён ЮKassa, заказ не обработан — проверьте вручную`);
    return { flipped, orderStatus: order?.status ?? null, restocked: false };
  }
  const settled = await settleOrder(deps, order, row);
  try {
    await notifyCustomerRefund(deps, order, row.amount);
  } catch (err) {
    console.error({ scope: "payments.refundFinalize", msg: "customer_refund не поставлен", refund_id: row.id, err });
  }
  return { flipped: true, orderStatus: settled.status, restocked: settled.restocked };
}
