import { formatRub } from "@/lib/money";
import { moscowDate } from "@/lib/orders/view";
import type { LatestRates } from "./settings-db";

// GET /api/admin/summary (Блок 3; Блок 4 «Админка — Сводка»; 5.8). Чистая сборка из репозитория (summary-db.ts).
// Решения, которых нет в Чертеже дословно (отмечены в отчёте Дня 6):
//  - preorders_in_progress («Под заказ в пути») — preorder в ordered_from_supplier / in_transit / arrived
//    (вкладка «Под заказ» Блока 4: «все preorder-статусы до arrived»); paid-заказы считаются в orders_to_process;
//  - low_stock — активные товары kind=stock с available_qty = stock_qty − брони ≤ 1 (Блок 4: «available_qty ≤ 1»);
//  - month — заказы с paid_at в текущем месяце по Москве (5.8: «paid_at в месяце»), revenue — сумма их total
//    (возвраты не вычитаются); goal_orders = 15 (5.8: цель 10–15, пример Блока 3);
//  - rates_date — самая старая из последних дат курсов USD/CNY (баннер «Курс не обновлялся 3 дня» по отстающей валюте);
//  - notifications_failed — строки notification_queue в статусе failed за последние 7 суток (иначе баннер не гаснет никогда).

export const MONTH_GOAL_ORDERS = 15;
export const LOW_STOCK_MAX_AVAILABLE = 1;
export const PREORDER_IN_PROGRESS_STATUSES = ["ordered_from_supplier", "in_transit", "arrived"] as const;
export const NOTIFICATIONS_FAILED_WINDOW_DAYS = 7;

export interface SummaryRepo {
  countOrdersByStatus(status: "paid"): Promise<number>;
  countOrdersNeedingAttention(): Promise<number>;
  countPreordersInStatuses(statuses: readonly string[]): Promise<number>;
  countAteliersPending(): Promise<number>;
  /** Активные товары из наличия: id, title, stock_qty. */
  listActiveStockProducts(): Promise<Array<{ id: string; title: string; stock_qty: number }>>;
  /** Брони неоплаченных заказов (reserved_qty_map, 2.19). */
  reservedQtyMap(): Promise<Map<string, number>>;
  /** total заказов с paid_at в [from, to). */
  listPaidTotals(fromIso: string, toIso: string): Promise<number[]>;
  latestRates(): Promise<LatestRates>;
  countNotificationsFailedSince(sinceIso: string): Promise<number>;
}

export interface AdminSummary {
  orders_to_process: number;
  orders_attention: number;
  preorders_in_progress: number;
  ateliers_pending: number;
  low_stock: Array<{ product_id: string; title: string; available_qty: number }>;
  month: { paid_orders: number; revenue: number; revenue_formatted: string; goal_orders: number };
  rates_date: string | null;
  notifications_failed: number;
}

/** Смещение Europe/Moscow от UTC в минутах на момент at (по tzdata, Edge Case 45). */
function moscowOffsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Moscow", timeZoneName: "longOffset" })
    .formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /^GMT([+-])(\d{2}):?(\d{2})?$/.exec(name);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? "0");
  return m[1] === "-" ? -minutes : minutes;
}

const moscowMidnightUtc = (y: number, month0: number): Date => {
  const guess = Date.UTC(y, month0, 1);
  return new Date(guess - moscowOffsetMinutes(new Date(guess)) * 60_000);
};

/** Границы текущего месяца по Москве: [1-е число 00:00 МСК, 1-е число следующего месяца 00:00 МСК). */
export function moscowMonthRange(now: Date): { from: string; to: string } {
  const [y, m] = moscowDate(now).split("-").map(Number);
  const from = moscowMidnightUtc(y, m - 1);
  const to = m === 12 ? moscowMidnightUtc(y + 1, 0) : moscowMidnightUtc(y, m);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function lowStock(
  products: Array<{ id: string; title: string; stock_qty: number }>, reserved: Map<string, number>,
): AdminSummary["low_stock"] {
  return products
    .map((p) => ({ product_id: p.id, title: p.title, available_qty: Math.max(p.stock_qty - (reserved.get(p.id) ?? 0), 0) }))
    .filter((p) => p.available_qty <= LOW_STOCK_MAX_AVAILABLE)
    .sort((a, b) => a.available_qty - b.available_qty || a.title.localeCompare(b.title, "ru"));
}

export function ratesDate(rates: LatestRates): string | null {
  const dates = Object.values(rates).map((r) => r.date).sort();
  return dates[0] ?? null;
}

export async function buildAdminSummary(repo: SummaryRepo, opts: { now: Date; featureAtelier: boolean }): Promise<AdminSummary> {
  const range = moscowMonthRange(opts.now);
  const failedSince = new Date(opts.now.getTime() - NOTIFICATIONS_FAILED_WINDOW_DAYS * 86_400_000).toISOString();
  const [toProcess, attention, preorders, ateliers, products, reserved, paidTotals, rates, failed] = await Promise.all([
    repo.countOrdersByStatus("paid"),
    repo.countOrdersNeedingAttention(),
    repo.countPreordersInStatuses(PREORDER_IN_PROGRESS_STATUSES),
    opts.featureAtelier ? repo.countAteliersPending() : Promise.resolve(0),
    repo.listActiveStockProducts(),
    repo.reservedQtyMap(),
    repo.listPaidTotals(range.from, range.to),
    repo.latestRates(),
    repo.countNotificationsFailedSince(failedSince),
  ]);
  const revenue = paidTotals.reduce((s, t) => s + t, 0);
  return {
    orders_to_process: toProcess,
    orders_attention: attention,
    preorders_in_progress: preorders,
    ateliers_pending: ateliers,
    low_stock: lowStock(products, reserved),
    month: { paid_orders: paidTotals.length, revenue, revenue_formatted: formatRub(revenue), goal_orders: MONTH_GOAL_ORDERS },
    rates_date: ratesDate(rates),
    notifications_failed: failed,
  };
}
