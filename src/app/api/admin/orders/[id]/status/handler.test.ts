import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { apiError } from "@/lib/api-error";
import { createChangeStatusHandler, type ChangeStatusHandlerDeps } from "@/app/api/admin/orders/[id]/status/handler";
import {
  ADMIN_ID, ADMIN_OK, API_UPDATED_AT, CLIENT_REQUEST_ID, DB_UPDATED_AT, FakeOrdersTable, ORDER_ID, orderRow,
} from "@/lib/admin/__fixtures__/fake-orders";
import type { OrderChangeRow } from "@/lib/admin/orders-write";

// PATCH /api/admin/orders/[id]/status на in-memory таблице заказов. JSON ответов и тексты — дословно Блок 3.

const NOW = new Date("2026-10-02T10:15:00.000Z");
const NO_STORE = "private, no-store";
const CONFLICT = { error: { code: "CONFLICT", message: "Заказ изменили в другой вкладке. Обновите страницу" } };
const NOT_FOUND = { error: { code: "NOT_FOUND", message: "Заказ не найден" } };

type Notice = Parameters<ChangeStatusHandlerDeps["notifyStatusChanged"]>[0];

function setup(rows: OrderChangeRow[] = [orderRow()], over: Partial<ChangeStatusHandlerDeps> = {}) {
  const db = new FakeOrdersTable(...rows);
  const calls: string[] = [];
  const notices: Notice[] = [];
  const deps: ChangeStatusHandlerDeps = {
    authorize: async () => { calls.push("auth"); return ADMIN_OK; },
    selectOrder: async (id) => { calls.push("select"); return db.selectOrder(id); },
    updateStatus: (id, guard, patch) => { calls.push("update"); return db.updateStatus(id, guard, patch); },
    insertHistory: (row) => { calls.push("history"); return db.insertHistory(row); },
    notifyStatusChanged: async (p) => { calls.push("notify"); notices.push(p); return true; },
    orderUrl: (n, crid) => `http://localhost:3000/orders/${n}?t=token-of-${crid}`,
    now: () => NOW,
    ...over,
  };
  const PATCH = createChangeStatusHandler(deps);
  const call = (body: unknown, id = ORDER_ID) => PATCH(
    new Request(`http://localhost:3000/api/admin/orders/${id}/status`, {
      method: "PATCH", headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { db, calls, notices, call };
}

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const body = (to: string, extra: Record<string, unknown> = {}) => ({ to_status: to, updated_at: API_UPDATED_AT, ...extra });

describe("PATCH /api/admin/orders/[id]/status — успешные переходы", () => {
  afterEach(() => mock.restoreAll());

  it("paid → confirmed: ответ Блока 3, история с changed_by, уведомление покупателю", async () => {
    const { db, calls, notices, call } = setup();
    const res = await call(body("confirmed", { note: "  Проверено по VIN  " }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), NO_STORE);
    const data = (await json(res)).data as Record<string, unknown>;
    assert.deepEqual(Object.keys(data), ["id", "status", "status_label", "allowed_transitions", "updated_at"]);
    assert.equal(data.status, "confirmed");
    assert.equal(data.status_label, "Проверен инженером");
    assert.deepEqual(data.allowed_transitions, ["shipped"]);
    assert.match(String(data.updated_at), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    assert.deepEqual(calls, ["auth", "select", "update", "history", "notify"]);
    // Блокировка: updated_at из БД (микросекунды, +00:00) и текущий статус.
    assert.deepEqual(db.updates[0].filter, { updated_at: DB_UPDATED_AT, status: "paid" });
    assert.deepEqual(db.updates[0].patch, { status: "confirmed" });
    assert.deepEqual(db.history, [{ order_id: ORDER_ID, from_status: "paid", to_status: "confirmed", changed_by: ADMIN_ID, note: "Проверено по VIN" }]);
    assert.deepEqual(notices, [{
      orderNumber: "FC-26-000123", customerEmail: "artem.sokolov@yandex.ru", status: "confirmed", trackingNumber: null,
      orderUrl: `http://localhost:3000/orders/FC-26-000123?t=token-of-${CLIENT_REQUEST_ID}`,
    }]);
  });

  it("confirmed → shipped (СДЭК) с треком: shipped_at, трек в заказе и в уведомлении", async () => {
    const { db, notices, call } = setup([orderRow({ status: "confirmed" })]);
    const res = await call(body("shipped", { tracking_number: "1234567890", note: "Отправлено СДЭК, страховка на полную стоимость" }));
    assert.equal(res.status, 200);
    const data = (await json(res)).data as Record<string, unknown>;
    assert.equal(data.status_label, "Передан в доставку");
    assert.deepEqual(data.allowed_transitions, ["delivered"]);
    assert.deepEqual(db.updates[0].patch, { status: "shipped", tracking_number: "1234567890", shipped_at: NOW.toISOString() });
    assert.equal(notices[0].trackingNumber, "1234567890");
    assert.equal(db.rows.get(ORDER_ID)?.tracking_number, "1234567890");
  });

  it("shipped (СДЭК до двери): трек уже сохранён в заказе через PATCH заказа — тело без трека принимается", async () => {
    const { db, notices, call } = setup([orderRow({ status: "confirmed", delivery_method: "cdek_door", tracking_number: "ABC-12345" })]);
    const res = await call(body("shipped"));
    assert.equal(res.status, 200);
    assert.deepEqual(db.updates[0].patch, { status: "shipped", shipped_at: NOW.toISOString() });
    assert.equal(notices[0].trackingNumber, "ABC-12345");
  });

  it("shipped (курьер по Москве) с заметкой: courier_note сохраняется, трека в уведомлении нет", async () => {
    const { db, notices, call } = setup([orderRow({ status: "confirmed", delivery_method: "moscow_courier" })]);
    const res = await call(body("shipped", { courier_note: "Курьер Сергей, +7 999 000-11-22, 14:00–18:00" }));
    assert.equal(res.status, 200);
    assert.deepEqual(db.updates[0].patch, {
      status: "shipped", courier_note: "Курьер Сергей, +7 999 000-11-22, 14:00–18:00", shipped_at: NOW.toISOString(),
    });
    assert.equal(notices[0].trackingNumber, null);
  });

  it("shipped → delivered: delivered_at", async () => {
    const { db, call } = setup([orderRow({ status: "shipped", tracking_number: "1234567890" })]);
    const res = await call(body("delivered"));
    assert.equal(res.status, 200);
    assert.deepEqual(((await json(res)).data as Record<string, unknown>).allowed_transitions, []);
    assert.deepEqual(db.updates[0].patch, { status: "delivered", delivered_at: NOW.toISOString() });
  });

  it("pending_payment → cancelled (BR-19): cancelled_at, история, уведомление", async () => {
    const { db, notices, call } = setup([orderRow({ status: "pending_payment" })]);
    const res = await call(body("cancelled"));
    assert.equal(res.status, 200);
    assert.equal(((await json(res)).data as Record<string, unknown>).status_label, "Отменён");
    assert.deepEqual(db.updates[0].patch, { status: "cancelled", cancelled_at: NOW.toISOString() });
    assert.equal(db.history[0].to_status, "cancelled");
    assert.equal(notices[0].status, "cancelled");
  });

  it("preorder: paid → ordered_from_supplier → in_transit → arrived → shipped → delivered", async () => {
    const { db, call } = setup([orderRow({ kind: "preorder" })]);
    for (const to of ["ordered_from_supplier", "in_transit", "arrived"]) {
      const updatedAt = db.rows.get(ORDER_ID)!.updated_at.replace("+00:00", "Z");
      const res = await call({ to_status: to, updated_at: updatedAt });
      assert.equal(res.status, 200, to);
    }
    let updatedAt = db.rows.get(ORDER_ID)!.updated_at.replace("+00:00", "Z");
    assert.equal((await call({ to_status: "shipped", tracking_number: "1234567890", updated_at: updatedAt })).status, 200);
    updatedAt = db.rows.get(ORDER_ID)!.updated_at.replace("+00:00", "Z");
    assert.equal((await call({ to_status: "delivered", updated_at: updatedAt })).status, 200);
    assert.deepEqual(db.history.map((h) => `${h.from_status}→${h.to_status}`), [
      "paid→ordered_from_supplier", "ordered_from_supplier→in_transit", "in_transit→arrived", "arrived→shipped", "shipped→delivered",
    ]);
  });
});

describe("PATCH /api/admin/orders/[id]/status — ошибки", () => {
  afterEach(() => mock.restoreAll());

  it("409 INVALID_STATUS_TRANSITION paid → delivered — дословно Блок 3; без записи", async () => {
    const { db, calls, call } = setup();
    const res = await call(body("delivered"));
    assert.equal(res.status, 409);
    assert.deepEqual(await json(res), {
      error: {
        code: "INVALID_STATUS_TRANSITION", message: "Из статуса «Оплачен» нельзя перейти в «Доставлен»",
        details: { from: "paid", to: "delivered", allowed: ["confirmed"] },
      },
    });
    assert.deepEqual(calls, ["auth", "select"]);
    assert.equal(db.updates.length, 0);
  });

  it("BR-19: cancelled из paid → 409 (только возврат)", async () => {
    const res = await setup().call(body("cancelled"));
    assert.equal(res.status, 409);
    assert.deepEqual(((await json(res)).error as Record<string, unknown>).details, { from: "paid", to: "cancelled", allowed: ["confirmed"] });
  });

  it("stock: переход в статус preorder (ordered_from_supplier) → 409", async () => {
    const res = await setup().call(body("ordered_from_supplier"));
    assert.equal(res.status, 409);
  });

  for (const to of ["paid", "refunded", "pending_payment"]) {
    it(`to_status=${to} не принимается схемой → 400 VALIDATION_ERROR, БД не трогается`, async () => {
      const { calls, call } = setup();
      const res = await call(body(to));
      assert.equal(res.status, 400);
      const err = (await json(res)).error as { code: string; details: { fields: Record<string, string[]> } };
      assert.equal(err.code, "VALIDATION_ERROR");
      assert.ok(err.details.fields.to_status);
      assert.deepEqual(calls, ["auth"]);
    });
  }

  it("shipped СДЭК без трека → 400 «Укажите трек-номер СДЭК» дословно (US-007)", async () => {
    const { db, call } = setup([orderRow({ status: "confirmed" })]);
    const res = await call(body("shipped", { tracking_number: null }));
    assert.equal(res.status, 400);
    assert.deepEqual(await json(res), {
      error: { code: "VALIDATION_ERROR", message: "Укажите трек-номер СДЭК", details: { fields: { tracking_number: ["Укажите трек-номер СДЭК"] } } },
    });
    assert.equal(db.updates.length, 0);
  });

  it("shipped курьер без заметки (пустая строка) → 400 по полю courier_note", async () => {
    const { db, call } = setup([orderRow({ status: "confirmed", delivery_method: "moscow_courier" })]);
    const res = await call(body("shipped", { courier_note: "   " }));
    assert.equal(res.status, 400);
    const err = (await json(res)).error as { details: { fields: Record<string, string[]> } };
    assert.deepEqual(Object.keys(err.details.fields), ["courier_note"]);
    assert.equal(db.updates.length, 0);
  });

  it("трек не по формату → 400 (Zod), БД не трогается", async () => {
    const { calls, call } = setup([orderRow({ status: "confirmed" })]);
    const res = await call(body("shipped", { tracking_number: "12 34" }));
    assert.equal(res.status, 400);
    assert.deepEqual(calls, ["auth"]);
  });

  it("устаревший updated_at → 409 CONFLICT, без записи", async () => {
    const { db, call } = setup();
    db.touch(ORDER_ID);
    const res = await call(body("confirmed"));
    assert.equal(res.status, 409);
    assert.deepEqual(await json(res), CONFLICT);
    assert.equal(db.updates.length, 0);
    assert.equal(db.history.length, 0);
  });

  it("гонка: заказ изменили между чтением и записью → update 0 строк → 409 CONFLICT, без истории и уведомления", async () => {
    const db = new FakeOrdersTable(orderRow());
    const { calls, call } = setup([], {
      selectOrder: db.selectOrder,
      updateStatus: async (id, guard, patch) => { db.touch(id, { status: "confirmed" }); return db.updateStatus(id, guard, patch); },
      insertHistory: db.insertHistory,
    });
    const res = await call(body("confirmed"));
    assert.equal(res.status, 409);
    assert.deepEqual(await json(res), CONFLICT);
    assert.equal(db.history.length, 0);
    assert.ok(!calls.includes("notify"));
  });

  it("нет заказа → 404; id не uuid → 404 без обращения к БД", async () => {
    const a = setup([]);
    const resA = await a.call(body("confirmed"));
    assert.equal(resA.status, 404);
    assert.deepEqual(await json(resA), NOT_FOUND);
    const b = setup();
    const resB = await b.call(body("confirmed"), "not-a-uuid");
    assert.equal(resB.status, 404);
    assert.deepEqual(b.calls, ["auth"]);
  });

  it("401 / 403 / 403 Origin из guard — первыми, без чтения тела и БД", async () => {
    for (const denied of [
      apiError("UNAUTHORIZED", "Войдите в аккаунт", 401),
      apiError("FORBIDDEN", "Недостаточно прав", 403),
      apiError("FORBIDDEN", "Недопустимый источник запроса", 403),
    ]) {
      const { calls, call } = setup([orderRow()], { authorize: async () => ({ ok: false, response: denied }) });
      const res = await call("{broken");
      assert.equal(res.status, denied.status);
      assert.equal(res.headers.get("Cache-Control"), NO_STORE);
      assert.deepEqual(calls, []);
    }
  });

  it("битый JSON → 400 VALIDATION_ERROR", async () => {
    const res = await setup().call("{broken");
    assert.equal(res.status, 400);
    assert.equal(((await json(res)).error as Record<string, unknown>).code, "VALIDATION_ERROR");
  });

  it("ошибка БД → 500 INTERNAL_ERROR без подробностей", async () => {
    const err = mock.method(console, "error", () => {});
    const res = await setup([orderRow()], { selectOrder: async () => { throw new Error("orders: 57014 secret detail"); } })
      .call(body("confirmed"));
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { error: { code: "INTERNAL_ERROR", message: "Что-то пошло не так. Мы уже разбираемся" } });
    assert.ok(!text.includes("secret"));
    assert.equal((err.mock.calls[0].arguments[0] as { scope: string }).scope, "admin.orders.status");
  });
});

describe("PATCH /api/admin/orders/[id]/status — сбои после записи статус не откатывают", () => {
  afterEach(() => mock.restoreAll());

  it("история: одна повторная попытка", async () => {
    const { db, call } = setup();
    db.failHistory = 1;
    assert.equal((await call(body("confirmed"))).status, 200);
    assert.equal(db.history.length, 1);
  });

  it("история не записалась дважды → 200, лог admin.orders.status.history", async () => {
    const err = mock.method(console, "error", () => {});
    const { db, call } = setup();
    db.failHistory = 2;
    assert.equal((await call(body("confirmed"))).status, 200);
    assert.equal(db.rows.get(ORDER_ID)?.status, "confirmed");
    assert.ok(err.mock.calls.some((c) => (c.arguments[0] as { scope: string }).scope === "admin.orders.status.history"));
  });

  it("уведомление бросает / не поставлено / ссылку не собрать → 200", async () => {
    mock.method(console, "error", () => {});
    for (const over of [
      { notifyStatusChanged: async () => { throw new Error("queue down"); } },
      { notifyStatusChanged: async () => false },
      { orderUrl: () => { throw new Error("ORDER_TOKEN_SECRET missing"); } },
    ] satisfies Array<Partial<ChangeStatusHandlerDeps>>) {
      const { db, call } = setup([orderRow()], over);
      const res = await call(body("confirmed"));
      assert.equal(res.status, 200);
      assert.equal(db.rows.get(ORDER_ID)?.status, "confirmed");
    }
  });

  it("ссылку не собрать → уведомление уходит без ссылки", async () => {
    mock.method(console, "error", () => {});
    const { notices, call } = setup([orderRow()], { orderUrl: () => { throw new Error("no secret"); } });
    await call(body("confirmed"));
    assert.equal(notices[0].orderUrl, null);
  });
});
