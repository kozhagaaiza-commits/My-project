import type { AdminApiAuth } from "@/lib/admin/api-guard";
import type { MetaPatch, MetaResultRow, OrderChangeRow, StatusHistoryInsert, StatusPatch, StatusResultRow } from "@/lib/admin/orders-write";
import type { OrderStatus } from "@/types/order-view";

// In-memory «таблица orders» для тестов смены статуса и правки заказа: update … where id and updated_at [and status]
// ведёт себя как PostgREST (0 строк → null), moddatetime сдвигает updated_at (микросекунды, «+00:00», как отдаёт PostgREST).

export const ORDER_ID = "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68";
export const ADMIN_ID = "5d1e7a3c-8b2f-4c6d-9e0a-1f3b5c7d9e21";
export const CLIENT_REQUEST_ID = "0e7c4a19-5b2d-4f8e-9a63-1d0c8b7e2f45";
/** Как отдаёт PostgREST. */
export const DB_UPDATED_AT = "2026-10-01T15:02:44.123456+00:00";
/** Как отдаёт наш GET (toIsoUtc) и возвращает клиент. */
export const API_UPDATED_AT = "2026-10-01T15:02:44.123456Z";

export const ADMIN_OK: AdminApiAuth = { ok: true, admin: { userId: ADMIN_ID, email: "owner@forgecarbon.ru" } };

export function orderRow(over: Partial<OrderChangeRow> = {}): OrderChangeRow {
  return {
    id: ORDER_ID, number: "FC-26-000123", kind: "stock", status: "paid", delivery_method: "cdek_pvz",
    tracking_number: null, courier_note: null, expected_ready_at: null, customer_visible_note: null,
    customer_email: "artem.sokolov@yandex.ru", client_request_id: CLIENT_REQUEST_ID, updated_at: DB_UPDATED_AT,
    ...over,
  };
}

export class FakeOrdersTable {
  rows = new Map<string, OrderChangeRow & Record<string, unknown>>();
  history: StatusHistoryInsert[] = [];
  updates: Array<{ id: string; filter: Record<string, string>; patch: Record<string, unknown> }> = [];
  private tick = 0;
  failHistory = 0;

  constructor(...rows: OrderChangeRow[]) {
    for (const r of rows) this.rows.set(r.id, { ...r });
  }

  private bump(): string {
    this.tick++;
    return `2026-10-02T10:15:00.${String(100000 + this.tick).padStart(6, "0")}+00:00`;
  }

  /** «Другая вкладка» изменила заказ. */
  touch(id: string, patch: Partial<OrderChangeRow> = {}) {
    const r = this.rows.get(id);
    if (r) this.rows.set(id, { ...r, ...patch, updated_at: this.bump() });
  }

  selectOrder = async (id: string): Promise<OrderChangeRow | null> => {
    const r = this.rows.get(id);
    return r ? { ...r } : null;
  };

  updateStatus = async (id: string, guard: { updatedAt: string; fromStatus: OrderStatus }, patch: StatusPatch): Promise<StatusResultRow | null> => {
    this.updates.push({ id, filter: { updated_at: guard.updatedAt, status: guard.fromStatus }, patch: { ...patch } });
    const r = this.rows.get(id);
    if (!r || r.updated_at !== guard.updatedAt || r.status !== guard.fromStatus) return null;
    const next = { ...r, ...patch, updated_at: this.bump() };
    this.rows.set(id, next);
    return { id, status: next.status, updated_at: next.updated_at };
  };

  updateMeta = async (id: string, updatedAt: string, patch: MetaPatch): Promise<MetaResultRow | null> => {
    this.updates.push({ id, filter: { updated_at: updatedAt }, patch: { ...patch } });
    const r = this.rows.get(id);
    if (!r || r.updated_at !== updatedAt) return null;
    const next = { ...r, ...patch, updated_at: this.bump() };
    this.rows.set(id, next);
    return { id, expected_ready_at: next.expected_ready_at, updated_at: next.updated_at };
  };

  insertHistory = async (row: StatusHistoryInsert): Promise<void> => {
    if (this.failHistory > 0) {
      this.failHistory--;
      throw new Error("order_status_history.insert: 08006 connection failure");
    }
    this.history.push({ ...row });
  };
}
