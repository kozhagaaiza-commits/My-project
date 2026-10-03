import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { apiError } from "@/lib/api-error";
import {
  createGetAdminOrderHandler, createPatchAdminOrderHandler, type GetAdminOrderDeps, type PatchAdminOrderDeps,
} from "@/app/api/admin/orders/[id]/handler";
import { ADMIN_OK, API_UPDATED_AT, DB_UPDATED_AT, FakeOrdersTable, ORDER_ID, orderRow } from "@/lib/admin/__fixtures__/fake-orders";
import type { AdminOrderDetailData } from "@/lib/admin/orders-db";
import type { OrderChangeRow } from "@/lib/admin/orders-write";

// GET и PATCH /api/admin/orders/[id] с подменами. Пример ответа — дословно Блок 3.

const NO_STORE = "private, no-store";
const NOT_FOUND = { error: { code: "NOT_FOUND", message: "Заказ не найден" } };
const CONFLICT = { error: { code: "CONFLICT", message: "Заказ изменили в другой вкладке. Обновите страницу" } };
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

/** Данные «из БД» для примера Блока 3 (FC-26-000123, оплачен, СДЭК ПВЗ, BMW G30). */
function detailData(over: Partial<AdminOrderDetailData["order"]> = {}): AdminOrderDetailData {
  return {
    order: {
      id: ORDER_ID, number: "FC-26-000123", kind: "stock", status: "paid",
      customer_name: "Артём Соколов", customer_phone: "+79165551234", customer_email: "artem.sokolov@yandex.ru",
      delivery_method: "cdek_pvz", delivery_city: "Казань", delivery_address: null, delivery_postal_code: null, cdek_pvz_code: "KZN45",
      vin: "WBAJA11050B123456", customer_comment: "Позвоните перед отправкой", total: 13370000,
      tracking_number: null, courier_note: null, admin_note: null, customer_visible_note: null, expected_ready_at: null,
      needs_attention: false, attention_reason: null, telegram_subscribed: true,
      consent_pd_at: "2026-10-01T12:30:41+00:00", consent_policy_version: "2026-10-01", updated_at: "2026-10-01T12:34:10+00:00",
      vehicle: { make: "BMW", model: "5 Series", generation: "G30", year_from: 2017, year_to: 2023 },
      ...over,
    },
    items: [{
      product_id: "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", title_snapshot: "Кованый моноблок M-01 R20, 5×112, графит",
      sku_snapshot: "FCF-M01-2085-GR",
      specs_snapshot: { type: "wheel_set", diameter_in: 20, width_front_in: 8.5, width_rear_in: 9.5, et_front_mm: 30, et_rear_mm: 40, pcd: "5x112", center_bore_mm: 66.6 },
      unit_price: 13370000, quantity: 1, line_total: 13370000,
    }],
    payments: [{
      id: "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d", yookassa_payment_id: "30a8d2c1-000f-5000-9000-1b6c4d2e8f10", status: "succeeded", amount: 13370000,
      payment_method_type: "sbp", created_at: "2026-10-01T12:31:02+00:00",
    }],
    refunds: [],
    history: [
      { from_status: null, to_status: "pending_payment", note: "Заказ создан", changed_by: null, changed_by_name: null, created_at: "2026-10-01T12:30:41+00:00" },
      { from_status: "pending_payment", to_status: "paid", note: "Оплата подтверждена ЮKassa", changed_by: null, changed_by_name: null, created_at: "2026-10-01T12:34:10+00:00" },
    ],
  };
}

const BLUEPRINT_EXAMPLE = {
  id: "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68", number: "FC-26-000123", kind: "stock", status: "paid",
  allowed_transitions: ["confirmed"],
  customer: { name: "Артём Соколов", phone: "+79165551234", email: "artem.sokolov@yandex.ru" },
  delivery: { method: "cdek_pvz", city: "Казань", cdek_pvz_code: "KZN45", address: null, postal_code: null },
  vehicle_label: "BMW 5 Series G30 · 2017–2023", vin: "WBAJA11050B123456", customer_comment: "Позвоните перед отправкой",
  items: [
    { product_id: "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", title: "Кованый моноблок M-01 R20, 5×112, графит", sku: "FCF-M01-2085-GR", specs: { type: "wheel_set", diameter_in: 20, width_front_in: 8.5, width_rear_in: 9.5, et_front_mm: 30, et_rear_mm: 40, pcd: "5x112", center_bore_mm: 66.6 }, quantity: 1, unit_price_formatted: "133 700 ₽", line_total_formatted: "133 700 ₽" },
  ],
  total: 13370000, total_formatted: "133 700 ₽",
  paid_amount: 13370000, refunded_amount: 0, refundable_amount: 13370000,
  payments: [{ yookassa_payment_id: "30a8d2c1-000f-5000-9000-1b6c4d2e8f10", status: "succeeded", method: "sbp", amount_formatted: "133 700 ₽", created_at: "2026-10-01T12:31:02.000Z" }],
  refunds: [],
  history: [
    { from_status: null, to_status: "pending_payment", note: "Заказ создан", changed_by_name: null, created_at: "2026-10-01T12:30:41.000Z" },
    { from_status: "pending_payment", to_status: "paid", note: "Оплата подтверждена ЮKassa", changed_by_name: null, created_at: "2026-10-01T12:34:10.000Z" },
  ],
  tracking_number: null, courier_note: null, admin_note: null, customer_visible_note: null,
  expected_ready_at: null, needs_attention: false, attention_reason: null,
  telegram_subscribed: true, consent_pd_at: "2026-10-01T12:30:41.000Z", consent_policy_version: "2026-10-01",
  updated_at: "2026-10-01T12:34:10.000Z",
};

const fmt = (s: string) => s.replace(/ | /g, " ");

function setupGet(over: Partial<GetAdminOrderDeps> = {}, data: AdminOrderDetailData | null = detailData()) {
  const calls: string[] = [];
  const deps: GetAdminOrderDeps = {
    authorize: async () => { calls.push("auth"); return ADMIN_OK; },
    cancelExpiredOrders: async () => { calls.push("cancel"); return 0; },
    loadDetail: async () => { calls.push("load"); return data; },
    reconcileOrderPayments: async () => { calls.push("reconcile"); return {}; },
    ...over,
  };
  const GET = createGetAdminOrderHandler(deps);
  return {
    calls,
    call: (id = ORDER_ID) => GET(new Request(`http://localhost:3000/api/admin/orders/${id}`), { params: Promise.resolve({ id }) }),
  };
}

describe("GET /api/admin/orders/[id]", () => {
  afterEach(() => mock.restoreAll());

  it("200: ответ строго как пример Блока 3; порядок auth → cancel → load", async () => {
    const { calls, call } = setupGet();
    const res = await call();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), NO_STORE);
    const body = JSON.parse(fmt(await res.text())) as { data: unknown };
    assert.deepEqual(body, { data: BLUEPRINT_EXAMPLE });
    assert.deepEqual(calls, ["auth", "cancel", "load"]);
  });

  it("служебное: chat id, client_request_id, токен и created_by наружу не выходят", async () => {
    const text = await (await setupGet().call()).text();
    for (const s of ["telegram_chat_id", "client_request_id", "public_token_hash", "changed_by\"", "created_by"]) assert.ok(!text.includes(s), s);
  });

  it("суммы: частичный и pending-возврат уменьшают refundable; refunded_amount — только succeeded; failed не считается", async () => {
    const data = detailData();
    data.refunds = [
      { id: "r1", payment_id: "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d", yookassa_refund_id: "y1", status: "succeeded", amount: 3340000, reason: "Брак одного диска", restock: false, error_message: null, created_at: "2026-10-03T09:00:00+00:00" },
      { id: "r2", payment_id: "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d", yookassa_refund_id: null, status: "pending", amount: 1000000, reason: "Компенсация", restock: false, error_message: null, created_at: "2026-10-03T09:10:00+00:00" },
      { id: "r3", payment_id: "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d", yookassa_refund_id: null, status: "failed", amount: 5000000, reason: "Ошибка", restock: false, error_message: "Недостаточно средств", created_at: "2026-10-03T09:20:00+00:00" },
    ];
    const d = (JSON.parse(fmt(await (await setupGet({}, data).call()).text())) as { data: Record<string, unknown> }).data;
    assert.equal(d.paid_amount, 13370000);
    assert.equal(d.refunded_amount, 3340000);
    assert.equal(d.refundable_amount, 13370000 - 3340000 - 1000000);
    assert.deepEqual((d.refunds as Array<Record<string, unknown>>)[2], {
      id: "r3", yookassa_refund_id: null, status: "failed", amount_formatted: "50 000 ₽",
      reason: "Ошибка", restock: false, error_message: "Недостаточно средств", created_at: "2026-10-03T09:20:00.000Z",
    });
  });

  it("pending_payment: сверка платежей и повторное чтение", async () => {
    const { calls, call } = setupGet({}, detailData({ status: "pending_payment" }));
    assert.equal((await call()).status, 200);
    assert.deepEqual(calls, ["auth", "cancel", "load", "reconcile", "load"]);
  });

  it("сверка дольше бюджета → ответ по текущим данным, остаток — continueAfterResponse", async () => {
    mock.method(console, "error", () => {});
    let continued = false;
    const { calls, call } = setupGet({
      reconcileOrderPayments: () => new Promise((r) => setTimeout(r, 200)),
      reconcileBudgetMs: 10,
      continueAfterResponse: () => { continued = true; },
    }, detailData({ status: "cancelled" }));
    assert.equal((await call()).status, 200);
    assert.ok(continued);
    assert.deepEqual(calls, ["auth", "cancel", "load"]);
  });

  it("pending-возврат: refreshOrderRefunds до расчёта сумм и повторное чтение; без pending — не вызывается", async () => {
    const data = detailData();
    data.refunds = [{ id: "r2", payment_id: "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d", yookassa_refund_id: null, status: "pending", amount: 1000000, reason: "Компенсация", restock: false, error_message: null, created_at: "2026-10-03T09:10:00+00:00" }];
    const a = setupGet({ refreshOrderRefunds: async () => { a.calls.push("refunds"); return {}; } }, data);
    assert.equal((await a.call()).status, 200);
    assert.deepEqual(a.calls, ["auth", "cancel", "load", "refunds", "load"]);
    const b = setupGet({ refreshOrderRefunds: async () => { b.calls.push("refunds"); return {}; } });
    await b.call();
    assert.deepEqual(b.calls, ["auth", "cancel", "load"]);
  });

  it("сбой ленивой отмены не роняет карточку", async () => {
    mock.method(console, "error", () => {});
    const res = await setupGet({ cancelExpiredOrders: async () => { throw new Error("rpc down"); } }).call();
    assert.equal(res.status, 200);
  });

  it("нет заказа → 404; не uuid → 404 без БД", async () => {
    const res = await setupGet({}, null).call();
    assert.equal(res.status, 404);
    assert.deepEqual(await json(res), NOT_FOUND);
    const b = setupGet();
    assert.equal((await b.call("FC-26-000123")).status, 404);
    assert.deepEqual(b.calls, ["auth"]);
  });

  it("401 / 403 до любой работы", async () => {
    for (const r of [apiError("UNAUTHORIZED", "Войдите в аккаунт", 401), apiError("FORBIDDEN", "Недостаточно прав", 403)]) {
      const { calls, call } = setupGet({ authorize: async () => ({ ok: false, response: r }) });
      const res = await call();
      assert.equal(res.status, r.status);
      assert.equal(res.headers.get("Cache-Control"), NO_STORE);
      assert.deepEqual(calls, []);
    }
  });

  it("ошибка БД → 500", async () => {
    mock.method(console, "error", () => {});
    const res = await setupGet({ loadDetail: async () => { throw new Error("db down"); } }).call();
    assert.equal(res.status, 500);
    assert.deepEqual(await json(res), { error: { code: "INTERNAL_ERROR", message: "Что-то пошло не так. Мы уже разбираемся" } });
  });
});

function setupPatch(rows: OrderChangeRow[] = [orderRow({ kind: "preorder", status: "ordered_from_supplier", expected_ready_at: "2026-11-01" })],
  over: Partial<PatchAdminOrderDeps> = {}) {
  const db = new FakeOrdersTable(...rows);
  const calls: string[] = [];
  const deps: PatchAdminOrderDeps = {
    authorize: async () => { calls.push("auth"); return ADMIN_OK; },
    selectOrder: async (id) => { calls.push("select"); return db.selectOrder(id); },
    updateMeta: (id, u, p) => { calls.push("update"); return db.updateMeta(id, u, p); },
    ...over,
  };
  const PATCH = createPatchAdminOrderHandler(deps);
  const call = (body: unknown, id = ORDER_ID) => PATCH(
    new Request(`http://localhost:3000/api/admin/orders/${id}`, {
      method: "PATCH", headers: { origin: "http://localhost:3000" }, body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { db, calls, call };
}

describe("PATCH /api/admin/orders/[id]", () => {
  afterEach(() => mock.restoreAll());

  it("200 как в Блоке 3: срок и сообщение клиенту; dep уведомления не задан → customer_notified: false", async () => {
    const { db, call } = setupPatch();
    const res = await call({
      expected_ready_at: "2026-11-12", customer_visible_note: "Задержка на таможне",
      admin_note: "Поставщик обещает отгрузку 01.11", updated_at: API_UPDATED_AT,
    });
    assert.equal(res.status, 200);
    const data = (await json(res)).data as Record<string, unknown>;
    assert.deepEqual(Object.keys(data), ["id", "expected_ready_at", "customer_notified", "updated_at"]);
    assert.equal(data.expected_ready_at, "2026-11-12");
    assert.equal(data.customer_notified, false);
    assert.match(String(data.updated_at), /Z$/);
    assert.deepEqual(db.updates[0], {
      id: ORDER_ID, filter: { updated_at: DB_UPDATED_AT },
      patch: { expected_ready_at: "2026-11-12", customer_visible_note: "Задержка на таможне", admin_note: "Поставщик обещает отгрузку 01.11" },
    });
  });

  it("notifyDeliveryChanged (A47) вызывается только при изменении срока или сообщения", async () => {
    const seen: unknown[] = [];
    const notify = async (p: unknown) => { seen.push(p); return true; };
    const a = setupPatch(undefined, { notifyDeliveryChanged: notify });
    const resA = await a.call({ expected_ready_at: "2026-11-12", updated_at: API_UPDATED_AT });
    assert.equal(((await json(resA)).data as Record<string, unknown>).customer_notified, true);
    assert.equal(seen.length, 1);
    const b = setupPatch(undefined, { notifyDeliveryChanged: notify });
    const resB = await b.call({ expected_ready_at: "2026-11-01", admin_note: "x", updated_at: API_UPDATED_AT }); // срок не изменился
    assert.equal(((await json(resB)).data as Record<string, unknown>).customer_notified, false);
    assert.equal(seen.length, 1);
  });

  it("notifyDeliveryChanged получает статус заказа и новые срок/заметку; не поставлено в очередь → false; исключение → 200", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const a = setupPatch(undefined, { notifyDeliveryChanged: async (p) => { seen.push({ ...p }); return true; } });
    await a.call({ customer_visible_note: "Задержка на таможне", updated_at: API_UPDATED_AT });
    assert.equal(seen[0].status, "ordered_from_supplier");
    assert.equal(seen[0].expectedReadyAt, "2026-11-01");
    assert.equal(seen[0].customerVisibleNote, "Задержка на таможне");
    const b = setupPatch(undefined, { notifyDeliveryChanged: async () => false });
    assert.equal(((await json(await b.call({ expected_ready_at: "2026-11-12", updated_at: API_UPDATED_AT }))).data as Record<string, unknown>).customer_notified, false);
    const c = setupPatch(undefined, { notifyDeliveryChanged: async () => { throw new Error("boom"); } });
    mock.method(console, "error", () => {});
    const resC = await c.call({ expected_ready_at: "2026-11-12", updated_at: API_UPDATED_AT });
    assert.equal(resC.status, 200);
    assert.equal(((await json(resC)).data as Record<string, unknown>).customer_notified, false);
  });

  it("«Снять отметку»: needs_attention=false; пустые строки очищают поля", async () => {
    const { db, call } = setupPatch();
    assert.equal((await call({ needs_attention: false, admin_note: "", courier_note: null, updated_at: API_UPDATED_AT })).status, 200);
    assert.deepEqual(db.updates[0].patch, { admin_note: null, courier_note: null, needs_attention: false });
  });

  it("только updated_at → без записи, 200 с текущими данными", async () => {
    const { db, call } = setupPatch();
    const res = await call({ updated_at: API_UPDATED_AT });
    assert.equal(res.status, 200);
    assert.equal(db.updates.length, 0);
    assert.deepEqual((await json(res)).data, { id: ORDER_ID, expected_ready_at: "2026-11-01", customer_notified: false, updated_at: API_UPDATED_AT });
  });

  it("устаревший updated_at → 409 CONFLICT без записи; гонка при записи → 409", async () => {
    const a = setupPatch();
    a.db.touch(ORDER_ID);
    const resA = await a.call({ admin_note: "x", updated_at: API_UPDATED_AT });
    assert.equal(resA.status, 409);
    assert.deepEqual(await json(resA), CONFLICT);
    assert.equal(a.db.updates.length, 0);

    const db = new FakeOrdersTable(orderRow());
    const b = setupPatch([], {
      selectOrder: db.selectOrder,
      updateMeta: async (id, u, p) => { db.touch(id); return db.updateMeta(id, u, p); },
    });
    const resB = await b.call({ admin_note: "x", updated_at: API_UPDATED_AT });
    assert.equal(resB.status, 409);
  });

  it("400: поле не по схеме / без updated_at / битый JSON", async () => {
    for (const body of [
      { tracking_number: "12 34", updated_at: API_UPDATED_AT },
      { expected_ready_at: "2026-02-30", updated_at: API_UPDATED_AT },
      { admin_note: "x" },
      { updated_at: "2026-10-01T15:02:44.123456+00:00" },
      "{broken",
    ]) {
      const { calls, call } = setupPatch();
      const res = await call(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(((await json(res)).error as Record<string, unknown>).code, "VALIDATION_ERROR");
      assert.deepEqual(calls, ["auth"]);
    }
  });

  it("нет заказа → 404; guard 403 → первым", async () => {
    assert.equal((await setupPatch([]).call({ admin_note: "x", updated_at: API_UPDATED_AT })).status, 404);
    const { calls, call } = setupPatch(undefined, {
      authorize: async () => ({ ok: false, response: apiError("FORBIDDEN", "Недопустимый источник запроса", 403) }),
    });
    assert.equal((await call({ admin_note: "x", updated_at: API_UPDATED_AT })).status, 403);
    assert.deepEqual(calls, []);
  });
});
