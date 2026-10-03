import { handleAtelierFixture } from "@/lib/admin-fixtures/ateliers-data";
import { allowedTransitionsFor } from "@/lib/admin-fixtures/transitions";
import { FIXTURE_ORDERS_COUNT, buildDetail, buildListItem, orderId } from "@/lib/admin-fixtures/orders-data";
import { handleSettingsRoute, type SettingsState, initialSettingsState } from "@/lib/admin-fixtures/settings-data";
import type { AdminOrderDetail, AdminOrderListItem, AdminSummary, OrderStatus } from "@/lib/admin-ui/types";
import { ORDER_TABS } from "@/lib/admin-ui/order-ui";
import { formatRub } from "@/lib/money";
import { orderStatusLabel } from "@/lib/order-labels";

// Dev-только (ADMIN_FIXTURES=1, Playwright route.fulfill): in-memory реализация /api/admin/* для экранов Дня 6.
// Формат ответов — Чертёж, Блок 3. В src/app не импортируется: в production-сборку не попадает.

export interface FixtureResponse {
  status: number;
  body: unknown;
}

interface State extends SettingsState {
  details: Map<string, AdminOrderDetail>;
  lists: Map<string, AdminOrderListItem>;
  notificationsFailed: number;
}

function initialState(): State {
  const details = new Map<string, AdminOrderDetail>();
  const lists = new Map<string, AdminOrderListItem>();
  for (let n = 1; n <= FIXTURE_ORDERS_COUNT; n++) {
    details.set(orderId(n), buildDetail(n));
    lists.set(orderId(n), buildListItem(n));
  }
  return { details, lists, notificationsFailed: 3, ...initialSettingsState() };
}

let state = initialState();

/** Сброс данных; patch — точечные подмены (например, устаревший курс). */
export function resetFixtures(patch: Partial<Pick<State, "notificationsFailed" | "ratesDate">> = {}): void {
  state = { ...initialState(), ...patch };
}

const json = (status: number, body: unknown): FixtureResponse => ({ status, body });
const ok = (data: unknown, meta?: unknown): FixtureResponse => json(200, meta ? { data, meta } : { data });
export const fixtureError = (status: number, code: string, message: string, details?: unknown): FixtureResponse =>
  json(status, { error: { code, message, ...(details ? { details } : {}) } });

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const now = (): string => new Date().toISOString();

function listOrders(params: URLSearchParams): FixtureResponse {
  const statuses = (params.get("status") ?? "").split(",").filter(Boolean);
  const q = (params.get("q") ?? "").toLowerCase();
  const perPage = 20;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const rows = [...state.lists.values()].filter(
    (o) =>
      (statuses.length === 0 || statuses.includes(o.status)) &&
      (params.get("attention") !== "true" || o.needs_attention) &&
      (q === "" || [o.number, o.customer_email, o.customer_phone].some((v) => v.toLowerCase().includes(q))),
  );
  return ok(rows.slice((page - 1) * perPage, page * perPage), { total: rows.length, page, per_page: perPage });
}

function syncList(d: AdminOrderDetail): void {
  const row = state.lists.get(d.id);
  if (row) {
    state.lists.set(d.id, { ...row, status: d.status, status_label: orderStatusLabel(d.status), needs_attention: d.needs_attention, attention_reason: d.attention_reason });
  }
}

function changeStatus(d: AdminOrderDetail, body: Record<string, unknown>): FixtureResponse {
  if (body.updated_at !== d.updated_at) return fixtureError(409, "CONFLICT", "Заказ изменили в другой вкладке. Обновите страницу");
  const to = body.to_status as OrderStatus;
  if (!d.allowed_transitions.includes(to)) {
    return fixtureError(409, "INVALID_STATUS_TRANSITION", `Из статуса «${orderStatusLabel(d.status)}» нельзя перейти в «${orderStatusLabel(to)}»`, { from: d.status, to, allowed: d.allowed_transitions });
  }
  const tracking = str(body.tracking_number);
  const courier = str(body.courier_note);
  if (to === "shipped") {
    const cdek = d.delivery.method !== "moscow_courier";
    if (cdek && !tracking) return fixtureError(400, "VALIDATION_ERROR", "Укажите трек-номер СДЭК", { fields: { tracking_number: ["Укажите трек-номер СДЭК"] } });
    if (!cdek && !courier) return fixtureError(400, "VALIDATION_ERROR", "Укажите заметку для курьера", { fields: { courier_note: ["Укажите заметку для курьера"] } });
  }
  const at = now();
  d.history.push({ from_status: d.status, to_status: to, note: str(body.note), changed_by_name: "Админ", created_at: at });
  d.status = to;
  d.allowed_transitions = allowedTransitionsFor(d.kind, to);
  if (tracking) d.tracking_number = tracking;
  if (courier) d.courier_note = courier;
  d.updated_at = at;
  syncList(d);
  return ok({ id: d.id, status: to, status_label: orderStatusLabel(to), allowed_transitions: d.allowed_transitions, updated_at: at });
}

function patchMeta(d: AdminOrderDetail, body: Record<string, unknown>): FixtureResponse {
  if (body.updated_at !== d.updated_at) return fixtureError(409, "CONFLICT", "Заказ изменили в другой вкладке. Обновите страницу");
  const notified = "expected_ready_at" in body || "customer_visible_note" in body;
  for (const key of ["expected_ready_at", "customer_visible_note", "admin_note", "tracking_number", "courier_note"] as const) {
    if (key in body) d[key] = str(body[key]);
  }
  if (typeof body.needs_attention === "boolean") {
    d.needs_attention = body.needs_attention;
    if (!body.needs_attention) d.attention_reason = null;
  }
  d.updated_at = now();
  syncList(d);
  return ok({ id: d.id, expected_ready_at: d.expected_ready_at, customer_notified: notified, updated_at: d.updated_at });
}

function refund(d: AdminOrderDetail, body: Record<string, unknown>): FixtureResponse {
  const amount = Number(body.amount);
  if (amount > d.refundable_amount) {
    return fixtureError(422, "REFUND_EXCEEDS_PAID", `Максимум к возврату: ${formatRub(d.refundable_amount)}`, { refundable_amount: d.refundable_amount });
  }
  if (String(body.reason).includes("502")) {
    return fixtureError(502, "PAYMENT_PROVIDER_ERROR", "ЮKassa отклонила возврат: Недостаточно средств на балансе магазина", { yookassa_code: "invalid_request" });
  }
  d.refunded_amount += amount;
  d.refundable_amount -= amount;
  d.refunds.push({ id: `refund-${d.refunds.length + 1}`, yookassa_refund_id: null, status: "succeeded", amount_formatted: formatRub(amount), reason: String(body.reason), restock: body.restock === true, error_message: null, created_at: now() });
  if (d.refundable_amount === 0) {
    d.history.push({ from_status: d.status, to_status: "refunded", note: String(body.reason), changed_by_name: "Админ", created_at: now() });
    d.status = "refunded";
    d.allowed_transitions = [];
  }
  d.updated_at = now();
  syncList(d);
  return ok({ refund_id: "b2d8f4a1-6c3e-4a9b-8f07-1e5c9d3a7b62", yookassa_refund_id: "2ec4b1f0-0015-5000-8000-1d7e2a9c4b36", status: "succeeded", amount_formatted: formatRub(amount), order_status: d.status });
}

function summary(): FixtureResponse {
  const rows = [...state.lists.values()];
  const count = (pred: (o: AdminOrderListItem) => boolean) => rows.filter(pred).length;
  const preorder = ORDER_TABS.find((t) => t.key === "preorder")?.statuses ?? [];
  const data: AdminSummary = {
    orders_to_process: count((o) => o.status === "paid"),
    orders_attention: count((o) => o.needs_attention),
    preorders_in_progress: count((o) => preorder.includes(o.status)),
    ateliers_pending: 1,
    low_stock: [{ product_id: "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", title: "Кованый моноблок M-01 R20, 5×112, графит", available_qty: 1 }],
    month: { paid_orders: 7, revenue: 79820000, revenue_formatted: formatRub(79820000), goal_orders: 15 },
    rates_date: state.ratesDate,
    notifications_failed: state.notificationsFailed,
  };
  return ok(data);
}

/** null — маршрут не из экранов Дня 6 (пусть обрабатывает другой обработчик / реальный API). */
export function handleAdminFixture(method: string, rawUrl: string, body: unknown): FixtureResponse | null {
  const url = new URL(rawUrl, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean); // ["api","admin",...]
  if (parts[0] !== "api" || parts[1] !== "admin") return null;
  const [, , section, id, action] = parts;
  const payload = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const atelier = section === "ateliers" ? handleAtelierFixture(method, rawUrl, body) : null;
  if (atelier) return atelier;
  if (section === "summary" && method === "GET") return summary();
  if (section === "orders" && !id && method === "GET") return listOrders(url.searchParams);
  if (section === "orders" && id) {
    const d = state.details.get(id);
    if (!d) return fixtureError(404, "NOT_FOUND", "Заказ не найден");
    if (!action && method === "GET") return ok(d);
    if (!action && method === "PATCH") return patchMeta(d, payload);
    if (action === "status" && method === "PATCH") return changeStatus(d, payload);
    if (action === "refund" && method === "POST") return refund(d, payload);
  }
  return handleSettingsRoute(state, method, parts, payload);
}
