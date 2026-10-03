import { MOSCOW_DELIVERY_DAYS, REGION_DELIVERY_DAYS } from "@/lib/config";
import { formatRub } from "@/lib/money";
import { DELIVERY_METHOD_LABELS, ORDER_STATUS_LABELS, TIMELINE_STEPS } from "@/lib/order-labels";
import { paymentFailureText, type LastPaymentRecord } from "@/lib/orders/payment-failure";
import type { DeliveryMethod, OrderKind, OrderStatus, OrderTimelineStep, OrderView } from "@/types/order-view";

// Сборка OrderView (Блок 3: GET /api/orders/[number]; 5.3; US-004, US-005; Блок 4 «Статус заказа»).
// ЧИСТЫЕ функции: без БД, env и сети — данные приходят из view-db.ts, токен и имя бота — из get-view.ts.
// Деньги — целые копейки, наружу только *_formatted (formatRub) и total.

/** Строка orders для страницы заказа: только колонки, которые видит покупатель (+ факт подписки на Telegram). */
export interface OrderViewOrder {
  id: string;
  number: string;
  kind: OrderKind;
  status: OrderStatus;
  delivery_method: DeliveryMethod;
  delivery_city: string;
  delivery_address: string | null;
  cdek_pvz_code: string | null;
  total: number;
  reserved_until: string | null;
  paid_at: string | null;
  expected_ready_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancel_reason: string | null;
  tracking_number: string | null;
  courier_note: string | null;
  customer_visible_note: string | null;
  /** telegram_chat_id != null; сам chat_id из слоя БД не выходит. */
  telegram_subscribed: boolean;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
}

export interface OrderViewItemRecord {
  title: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  product_slug: string | null;
}

/** order_status_history: только to_status и created_at (note скрыт колоночными правами, 2.18). */
export interface OrderHistoryEntry {
  to_status: string;
  created_at: string;
}

export interface OrderViewData {
  order: OrderViewOrder;
  items: OrderViewItemRecord[];
  history: OrderHistoryEntry[];
  /** Сумма возвратов со статусом succeeded, копейки. */
  refunded_amount: number;
  /** Последний платёж заказа (статус + код причины отмены ЮKassa) или null — платежей нет. */
  last_payment: LastPaymentRecord | null;
}

export interface BuildOrderViewInput extends OrderViewData {
  now: Date;
  /** Токен из ссылки — ТОЛЬКО если доступ получен по нему (иначе null): от него зависит telegram_link. */
  accessToken: string | null;
  telegramBotUsername: string;
}

export const CDEK_TRACKING_URL = "https://www.cdek.ru/ru/tracking?order_id=";

const MS_PER_DAY = 86_400_000;
const moscowParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
});

/** Календарная дата момента по московскому времени, YYYY-MM-DD (Edge Case 41). */
export function moscowDate(at: Date): string {
  const p = Object.fromEntries(moscowParts.formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** YYYY-MM-DD + n рабочих дней: суббота и воскресенье пропускаются, праздники не учитываются (5.3). */
export function addBusinessDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  let t = Date.UTC(y, m - 1, d);
  for (let added = 0; added < n;) {
    t += MS_PER_DAY;
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return new Date(t).toISOString().slice(0, 10);
}

const isCdek = (m: DeliveryMethod) => m === "cdek_pvz" || m === "cdek_door";

/** Ожидаемая доставка — только в статусе shipped: дата отгрузки (МСК) + срок способа доставки в рабочих днях. */
export function expectedDelivery(o: Pick<OrderViewOrder, "status" | "shipped_at" | "delivery_method">) {
  if (o.status !== "shipped" || o.shipped_at === null) return null;
  const shipped = new Date(o.shipped_at);
  if (Number.isNaN(shipped.getTime())) return null;
  const days = o.delivery_method === "moscow_courier" ? MOSCOW_DELIVERY_DAYS : REGION_DELIVERY_DAYS;
  const base = moscowDate(shipped);
  return { from: addBusinessDays(base, days.min), to: addBusinessDays(base, days.max) };
}

/** «artem@yandex.ru» → «ar***@yandex.ru»; локальная часть ≤ 3 символов → 1 символ. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const visible = local.length <= 3 ? 1 : 2;
  return `${local.slice(0, visible)}***${email.slice(at)}`;
}

/** «+79165551234» → «+7 916 ***-**-34». */
export function maskPhone(phone: string): string {
  const m = /^\+7(\d{3})\d{5}(\d{2})$/.exec(phone);
  return m ? `+7 ${m[1]} ***-**-${m[2]}` : "***";
}

/** Время из PostgREST (`…+00:00`, микросекунды) → ISO `…Z`; нераспознанное — как есть. */
function iso(v: string | null): string | null {
  if (v === null) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? v : new Date(t).toISOString();
}

/** Когда заказ пришёл в статус: последняя запись истории, иначе дата из строки заказа. */
function stepAt(step: OrderStatus, o: OrderViewOrder, history: OrderHistoryEntry[]): string | null {
  let last: string | null = null;
  for (const h of history) {
    if (h.to_status === step && (last === null || Date.parse(h.created_at) >= Date.parse(last))) last = h.created_at;
  }
  if (last !== null) return iso(last);
  if (step === "paid") return iso(o.paid_at);
  if (step === "shipped") return iso(o.shipped_at);
  if (step === "delivered") return iso(o.delivered_at);
  return null;
}

/**
 * Таймлайн по kind. Для статуса из шагов выполнены все шаги до него включительно. Для pending_payment / cancelled /
 * refunded (их нет в шагах) — только шаги, до которых заказ реально дошёл (по истории и датам), не дальше.
 */
export function buildTimeline(o: OrderViewOrder, history: OrderHistoryEntry[]): OrderTimelineStep[] {
  const steps = TIMELINE_STEPS[o.kind];
  const at = steps.map((s) => stepAt(s, o, history));
  let reached = steps.indexOf(o.status);
  if (reached < 0) at.forEach((v, i) => { if (v !== null) reached = Math.max(reached, i); });
  return steps.map((status, i) => {
    const done = i <= reached;
    return { status, label: ORDER_STATUS_LABELS[status], at: done ? at[i] : null, done };
  });
}

export function buildOrderView(input: BuildOrderViewInput): OrderView {
  const o = input.order;
  const pending = o.status === "pending_payment";
  const reservedMs = o.reserved_until === null ? Number.NaN : Date.parse(o.reserved_until);
  const canPay = pending && !Number.isNaN(reservedMs) && reservedMs > input.now.getTime();
  const tracking = isCdek(o.delivery_method) && o.tracking_number
    ? { number: o.tracking_number, url: `${CDEK_TRACKING_URL}${encodeURIComponent(o.tracking_number)}` }
    : null;

  return {
    number: o.number,
    kind: o.kind,
    status: o.status,
    status_label: ORDER_STATUS_LABELS[o.status],
    timeline: buildTimeline(o, input.history),
    items: input.items.map((i) => ({
      title: i.title,
      quantity: i.quantity,
      unit_price_formatted: formatRub(i.unit_price),
      line_total_formatted: formatRub(i.line_total),
      product_slug: i.product_slug,
    })),
    total: o.total,
    total_formatted: formatRub(o.total),
    delivery: {
      method: o.delivery_method,
      method_label: DELIVERY_METHOD_LABELS[o.delivery_method],
      city: o.delivery_city,
      cdek_pvz_code: o.cdek_pvz_code,
      address: o.delivery_address,
    },
    tracking,
    courier_note: o.delivery_method === "moscow_courier" ? o.courier_note : null,
    expected_delivery: expectedDelivery(o),
    expected_ready_at: o.kind === "preorder" ? o.expected_ready_at : null,
    customer_visible_note: o.customer_visible_note,
    reserved_until: pending ? iso(o.reserved_until) : null,
    can_pay: canPay,
    telegram_subscribed: o.telegram_subscribed,
    telegram_link: input.accessToken === null
      ? null
      : `https://t.me/${input.telegramBotUsername}?start=o_${input.accessToken}`,
    customer: { name: o.customer_name, email_masked: maskEmail(o.customer_email), phone_masked: maskPhone(o.customer_phone) },
    cancel_reason: o.status === "cancelled" ? o.cancel_reason : null,
    refunded_amount_formatted: input.refunded_amount > 0 ? formatRub(input.refunded_amount) : null,
    payment_error: canPay ? paymentFailureText(input.last_payment) : null,
  };
}
