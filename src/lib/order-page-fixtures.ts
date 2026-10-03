// DEV-ONLY демо-данные страницы заказа без Supabase/ЮKassa (ORDERS_FIXTURES=1 и NODE_ENV !== "production").
// Подключаются динамическим import в условии, записанном прямо в page.tsx (как catalog-queries.ts), —
// в production-сборке этот модуль вырезается. Не импортировать из других мест.
// Выбор заказа — по номеру FC-26-0000NN; токен — FIXTURE_ORDER_TOKEN, любой другой → not_found.
import { DELIVERY_METHOD_LABELS, ORDER_STATUS_LABELS, TIMELINE_STEPS } from "@/lib/order-labels";
import type { OrderKind, OrderStatus, OrderTimelineStep, OrderView, OrderViewItem } from "@/types/order-view";

export const FIXTURE_ORDER_TOKEN = "FixtureTokenAaBbCc0123456789_-xY";
export type FixtureResult = { kind: "ok"; view: OrderView } | { kind: "not_found" };

const WHEELS: OrderViewItem = {
  title: "Кованый моноблок M-01 R20, 5×112, графит", quantity: 1,
  unit_price_formatted: "133 700 ₽", line_total_formatted: "133 700 ₽", product_slug: "forged-m01-r20-5x112-graphite",
};
const DIFFUSER: OrderViewItem = {
  title: "Задний диффузор, карбон, BMW M4 G82/G83", quantity: 1,
  unit_price_formatted: "98 600 ₽", line_total_formatted: "98 600 ₽", product_slug: "bmw-m4-g82-carbon-rear-diffuser",
};
const CAP: OrderViewItem = {
  title: "Колпачки ступицы, комплект 4 шт.", quantity: 2,
  unit_price_formatted: "3 200 ₽", line_total_formatted: "6 400 ₽", product_slug: null,
};

/** Таймлайн: первые doneCount шагов выполнены, даты — от старта с шагом в сутки. */
function timeline(kind: OrderKind, doneCount: number, start = "2026-10-01T09:34:10.000Z"): OrderTimelineStep[] {
  return TIMELINE_STEPS[kind].map((status, i) => ({
    status,
    label: ORDER_STATUS_LABELS[status],
    at: i < doneCount ? new Date(Date.parse(start) + i * 26 * 3_600_000).toISOString() : null,
    done: i < doneCount,
  }));
}

function view(number: string, status: OrderStatus, patch: Partial<OrderView> = {}): OrderView {
  return {
    number, kind: "stock", status, status_label: ORDER_STATUS_LABELS[status],
    timeline: timeline("stock", 1), items: [WHEELS], total: 13370000, total_formatted: "133 700 ₽",
    delivery: { method: "cdek_pvz", method_label: DELIVERY_METHOD_LABELS.cdek_pvz, city: "Казань", cdek_pvz_code: "KZN45", address: null },
    tracking: null, courier_note: null, expected_delivery: null, expected_ready_at: null, customer_visible_note: null,
    reserved_until: null, can_pay: false, telegram_subscribed: false,
    telegram_link: `https://t.me/forgecarbon_bot?start=o_${FIXTURE_ORDER_TOKEN}`,
    customer: { name: "Артём Соколов", email_masked: "ar***@yandex.ru", phone_masked: "+7 916 ***-**-34" },
    cancel_reason: null, refunded_amount_formatted: null, payment_error: null,
    ...patch,
  };
}

const CDEK_TRACK = { number: "1234567890", url: "https://www.cdek.ru/ru/tracking?order_id=1234567890" };

/** Набор состояний: 01 paid, 02 shipped СДЭК, 03 preorder in_transit, 04 pending_payment с бронью, 05 cancelled,
 *  06 refunded, 07 курьер, 08 с заметкой, 09 delivered, 10 preorder paid, 11 подписан на Telegram, 12 без slug, 13 медленный (loading). */
export function fixtureOrderViews(now: Date = new Date()): Record<string, OrderView> {
  const n = (i: number) => `FC-26-${String(i).padStart(6, "0")}`;
  const preorder = { kind: "preorder" as const, items: [DIFFUSER], total: 9860000, total_formatted: "98 600 ₽" };
  return {
    [n(1)]: view(n(1), "paid", { timeline: timeline("stock", 1) }),
    [n(2)]: view(n(2), "shipped", {
      timeline: timeline("stock", 3), tracking: CDEK_TRACK, telegram_subscribed: true,
      expected_delivery: { from: "2026-10-04", to: "2026-10-07" },
    }),
    [n(3)]: view(n(3), "in_transit", {
      ...preorder, timeline: timeline("preorder", 3), expected_ready_at: "2026-11-05",
    }),
    [n(4)]: view(n(4), "pending_payment", {
      timeline: timeline("stock", 0), can_pay: true, reserved_until: new Date(now.getTime() + 18 * 60_000).toISOString(),
    }),
    [n(5)]: view(n(5), "cancelled", { timeline: timeline("stock", 0), cancel_reason: "Не оплачен за 30 минут" }),
    [n(6)]: view(n(6), "refunded", {
      timeline: timeline("stock", 2), refunded_amount_formatted: "133 700 ₽", cancel_reason: null,
    }),
    [n(7)]: view(n(7), "shipped", {
      timeline: timeline("stock", 3),
      delivery: { method: "moscow_courier", method_label: DELIVERY_METHOD_LABELS.moscow_courier, city: "Москва", cdek_pvz_code: null, address: "ул. Тверская, 12, кв. 34" },
      courier_note: "Курьер Игорь, +7 905 123-45-67. Позвонит за 30 минут",
      expected_delivery: { from: "2026-10-04", to: "2026-10-05" },
    }),
    [n(8)]: view(n(8), "confirmed", {
      timeline: timeline("stock", 2),
      customer_visible_note: "Колёса проходят финальную проверку балансировки. Отгрузка завтра до 12:00",
    }),
    [n(9)]: view(n(9), "delivered", { timeline: timeline("stock", 4), tracking: CDEK_TRACK }),
    [n(10)]: view(n(10), "paid", { ...preorder, timeline: timeline("preorder", 1), expected_ready_at: "2026-11-05" }),
    [n(11)]: view(n(11), "paid", { telegram_subscribed: true, telegram_link: null }),
    [n(12)]: view(n(12), "paid", { items: [WHEELS, CAP], total: 14010000, total_formatted: "140 100 ₽" }),
    [n(13)]: view(n(13), "paid"), // медленный: страница ждёт fixtureDelayMs (для проверки loading.tsx)
  };
}

/** Искусственная задержка ответа сервера (мс) для медленного заказа 13 — чтобы на экране был виден loading.tsx. */
export const fixtureDelayMs = (number: string): number => (number === "FC-26-000013" ? 2500 : 0);

export function getFixtureOrderView(number: string, token: string | null, now: Date = new Date()): FixtureResult {
  if (token !== FIXTURE_ORDER_TOKEN) return { kind: "not_found" };
  const found = fixtureOrderViews(now)[number];
  return found ? { kind: "ok", view: found } : { kind: "not_found" };
}
