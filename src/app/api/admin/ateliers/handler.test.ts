import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAdminAteliersListHandler } from "@/app/api/admin/ateliers/handler";
import { createAdminAtelierReviewHandler, type AdminAtelierReviewDeps } from "@/app/api/admin/ateliers/[id]/handler";
import { ADMIN_OK } from "@/lib/admin/__fixtures__/fake-orders";
import type { AdminApiAuth } from "@/lib/admin/api-guard";
import { apiError } from "@/lib/api-error";
import { AT_ID, FakeAteliers, INN, OTHER_AT, OTHER_USER, USER, atelier } from "@/lib/ateliers/__fixtures__/fake";
import type { NotificationInput } from "@/lib/notifications/types";

// GET /api/admin/ateliers и PATCH /api/admin/ateliers/[id] на in-memory подмене (Блок 3 «Админка — ателье», US-009, BR-10).

const NOW = new Date("2026-10-02T09:00:00.000Z");
const DENY_401: AdminApiAuth = { ok: false, response: apiError("UNAUTHORIZED", "Войдите в аккаунт", 401) };

describe("GET /api/admin/ateliers", () => {
  const list = (db: FakeAteliers, qs = "", over: { featureAtelier?: boolean; auth?: AdminApiAuth } = {}) =>
    createAdminAteliersListHandler({
      featureAtelier: over.featureAtelier ?? true, authorize: async () => over.auth ?? ADMIN_OK, repo: () => db.admin(),
    })(new Request(`http://localhost:3000/api/admin/ateliers${qs}`));

  it("строка — JSON Блока 3 (email из auth.users, orders_count), meta; no-store", async () => {
    const db = new FakeAteliers(atelier(), atelier({ id: OTHER_AT, user_id: OTHER_USER, status: "approved", created_at: "2026-09-01T10:00:00Z" }));
    db.orders.set(OTHER_AT, 4);
    const res = await list(db, "?status=pending&page=1");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await res.json(), {
      data: [{
        id: AT_ID, company_name: "Garage 77", inn: INN, city: "Санкт-Петербург", contact_name: "Илья Ветров", phone: "+79213004050",
        email: "ilya@garage77.ru", website: "https://vk.com/garage77spb", comment: "Ставим диски и обвесы на BMW и Audi, 15–20 машин в месяц",
        status: "pending", orders_count: 0, created_at: "2026-10-01T14:20:00.000Z",
      }],
      meta: { total: 1, page: 1, per_page: 20 },
    });
    const approved = await (await list(db, "?status=approved")).json();
    assert.deepEqual(approved.data.map((r: { orders_count: number; email: string | null }) => [r.orders_count, r.email]), [[4, null]]);
  });

  it("orders_count — один запрос на страницу, не по строке", async () => {
    const db = new FakeAteliers(atelier(), atelier({ id: OTHER_AT, user_id: OTHER_USER }));
    db.orders.set(AT_ID, 2);
    const res = await list(db);
    const byId = Object.fromEntries((await res.json()).data.map((r: { id: string; orders_count: number }) => [r.id, r.orders_count]));
    assert.deepEqual(byId, { [AT_ID]: 2, [OTHER_AT]: 0 });
    assert.equal(db.calls.filter((c) => c === "countOrders").length, 1);
  });

  it("сбой чтения email → email null, список отдаётся", async () => {
    const db = new FakeAteliers(atelier());
    db.fail.userEmail = new Error("auth api down");
    const res = await list(db);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data[0].email, null);
  });

  it("неизвестный статус → 400; 401 из guard до БД; FEATURE_ATELIER=false → 404", async () => {
    const db = new FakeAteliers(atelier());
    assert.equal((await list(db, "?status=archived")).status, 400);
    assert.equal((await list(db, "", { auth: DENY_401 })).status, 401);
    assert.equal((await list(db, "", { featureAtelier: false })).status, 404);
    assert.deepEqual(db.calls, []);
  });
});

function review(db: FakeAteliers, over: Partial<AdminAtelierReviewDeps> = {}) {
  const sent: NotificationInput[] = [];
  const PATCH = createAdminAtelierReviewHandler({
    featureAtelier: true, authorize: async () => ADMIN_OK, repo: () => db.admin(), enqueue: async (n) => { sent.push(n); },
    now: () => NOW, ...over,
  });
  const call = (body: unknown, id: string = AT_ID) => PATCH(
    new Request(`http://localhost:3000/api/admin/ateliers/${id}`, { method: "PATCH", body: JSON.stringify(body), headers: { origin: "http://localhost:3000" } }),
    { params: Promise.resolve({ id }) },
  );
  return { call, sent };
}

const APPROVE = { status: "approved", rejection_reason: null };
const REJECT = { status: "rejected", rejection_reason: "Не нашли информации об ателье. Пришлите ссылку на сайт или соцсети" };

describe("PATCH /api/admin/ateliers/[id]", () => {
  it("одобрение: 200 Блока 3, role customer → atelier, письмо atelier_approved", async () => {
    const db = new FakeAteliers(atelier());
    const { call, sent } = review(db);
    const res = await call(APPROVE);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { data: { id: AT_ID, status: "approved", reviewed_at: "2026-10-02T09:00:00.000Z" } });
    assert.equal(db.rows.get(AT_ID)?.status, "approved");
    assert.equal(db.roles.get(USER), "atelier");
    assert.deepEqual(sent, [{ channel: "email", recipient: "ilya@garage77.ru", template: "atelier_approved", payload: { company_name: "Garage 77" } }]);
    // роль раньше статуса: сбой статуса не оставит одобренную заявку без роли, роль без approved цен не даёт
    assert.ok(db.calls.indexOf("setRole:atelier") < db.calls.indexOf("updateReview"));
  });

  it("отказ: причина, role atelier → customer (отзыв одобренной), письмо atelier_rejected", async () => {
    const db = new FakeAteliers(atelier({ status: "approved", reviewed_at: "2026-10-01T09:00:00Z" }));
    db.roles.set(USER, "atelier");
    const { call, sent } = review(db);
    const res = await call(REJECT);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.status, "rejected");
    assert.equal(db.rows.get(AT_ID)?.rejection_reason, REJECT.rejection_reason);
    assert.equal(db.roles.get(USER), "customer");
    assert.deepEqual(sent[0], { channel: "email", recipient: "ilya@garage77.ru", template: "atelier_rejected", payload: { company_name: "Garage 77", rejection_reason: REJECT.rejection_reason } });
    // статус раньше роли: цены закрываются первой же записью
    assert.ok(db.calls.indexOf("updateReview") < db.calls.indexOf("setRole:customer"));
  });

  it("ИНН уже одобрен под другим аккаунтом → 409 CONFLICT текстом Блока 3, роль не меняется", async () => {
    const db = new FakeAteliers(atelier(), atelier({ id: OTHER_AT, user_id: OTHER_USER, status: "approved" }));
    const { call, sent } = review(db);
    const res = await call(APPROVE);
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: { code: "CONFLICT", message: `Ателье с ИНН ${INN} уже одобрено под другим аккаунтом` } });
    assert.equal(db.roles.get(USER), "customer");
    assert.equal(sent.length, 0);
  });

  it("гонка уникальности ИНН (23505 при update) → 409, роль откатывается", async () => {
    const db = new FakeAteliers(atelier(), atelier({ id: OTHER_AT, user_id: OTHER_USER, status: "pending" }));
    const repo = db.admin();
    repo.existsOtherApprovedInn = async () => false; // параллельное одобрение после проверки
    db.rows.get(OTHER_AT)!.status = "approved";
    const res = await review(db, { repo: () => repo }).call(APPROVE);
    assert.equal(res.status, 409);
    assert.match((await res.json()).error.message, /уже одобрено/);
    assert.equal(db.roles.get(USER), "customer");
  });

  it("статус изменили в другой вкладке → 409 CONFLICT, роль откатывается, письма нет", async () => {
    const db = new FakeAteliers(atelier());
    db.raceStatus = "rejected";
    const { call, sent } = review(db);
    const res = await call(APPROVE);
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.message, "Заявку изменили в другой вкладке. Обновите страницу");
    assert.equal(db.roles.get(USER), "customer");
    assert.equal(sent.length, 0);
  });

  it("повтор того же решения → 200 с прежним reviewed_at, без записи и письма", async () => {
    const db = new FakeAteliers(atelier({ status: "approved", reviewed_at: "2026-10-01T09:00:00+00:00" }));
    db.roles.set(USER, "atelier");
    const { call, sent } = review(db);
    const res = await call(APPROVE);
    assert.deepEqual(await res.json(), { data: { id: AT_ID, status: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" } });
    assert.ok(!db.calls.includes("updateReview"));
    assert.equal(sent.length, 0);
  });

  it("повтор approved досинхронизирует роль customer → atelier", async () => {
    const db = new FakeAteliers(atelier({ status: "approved", reviewed_at: "2026-10-01T09:00:00Z" }));
    const res = await review(db).call(APPROVE);
    assert.equal(res.status, 200);
    assert.equal(db.roles.get(USER), "atelier");
  });

  it("повтор rejected досинхронизирует роль atelier → customer, без записи и письма", async () => {
    const db = new FakeAteliers(atelier({ status: "rejected", rejection_reason: REJECT.rejection_reason, reviewed_at: "2026-10-01T09:00:00Z" }));
    db.roles.set(USER, "atelier");
    const { call, sent } = review(db);
    const res = await call(REJECT);
    assert.deepEqual(await res.json(), { data: { id: AT_ID, status: "rejected", reviewed_at: "2026-10-01T09:00:00.000Z" } });
    assert.equal(db.roles.get(USER), "customer");
    assert.ok(!db.calls.includes("updateReview"));
    assert.equal(sent.length, 0);
  });

  it("сбой досинхронизации роли при повторе → 200 (ошибка в лог)", async () => {
    for (const [status, body, failKey] of [["approved", APPROVE, "setRole:atelier"], ["rejected", REJECT, "setRole:customer"]] as const) {
      const db = new FakeAteliers(atelier({ status, reviewed_at: "2026-10-01T09:00:00Z" }));
      db.fail[failKey] = new Error("db");
      const res = await review(db).call(body);
      assert.equal(res.status, 200);
      assert.equal((await res.json()).data.status, status);
    }
  });

  it("администратор с заявкой не теряет роль admin", async () => {
    const db = new FakeAteliers(atelier());
    db.roles.set(USER, "admin");
    await review(db).call(APPROVE);
    assert.equal(db.roles.get(USER), "admin");
    await review(db).call(REJECT);
    assert.equal(db.roles.get(USER), "admin");
  });

  it("сбой смены роли при отказе → 200 (цены уже закрыты статусом), ошибка в лог", async () => {
    const db = new FakeAteliers(atelier({ status: "approved" }));
    db.fail["setRole:customer"] = new Error("db");
    const res = await review(db).call(REJECT);
    assert.equal(res.status, 200);
    assert.equal(db.rows.get(AT_ID)?.status, "rejected");
  });

  it("сбой смены роли при одобрении → 500, заявка не одобрена", async () => {
    const db = new FakeAteliers(atelier());
    db.fail["setRole:atelier"] = new Error("db");
    const res = await review(db).call(APPROVE);
    assert.equal(res.status, 500);
    assert.equal(db.rows.get(AT_ID)?.status, "pending");
  });

  it("нет email → решение сохраняется, письмо не ставится", async () => {
    const db = new FakeAteliers(atelier());
    db.emails.clear();
    const { call, sent } = review(db);
    assert.equal((await call(APPROVE)).status, 200);
    assert.equal(sent.length, 0);
  });

  it("валидация: причина < 10 символов, approved с причиной → 400; битый id / нет заявки → 404", async () => {
    const db = new FakeAteliers(atelier());
    const { call } = review(db);
    const short = await call({ status: "rejected", rejection_reason: "нет" });
    assert.equal(short.status, 400);
    assert.ok((await short.json()).error.details.fields.rejection_reason);
    assert.equal((await call({ status: "approved", rejection_reason: "текст причины" })).status, 400);
    assert.equal((await call({ status: "pending", rejection_reason: null })).status, 400);
    const bad = await call(APPROVE, "not-a-uuid");
    assert.equal(bad.status, 404);
    assert.deepEqual(await bad.json(), { error: { code: "NOT_FOUND", message: "Заявка не найдена" } });
    assert.equal((await call(APPROVE, "0b5e9d3a-2f4c-4b6e-8a1d-3c5e7f9b1d24")).status, 404);
  });

  it("guard (401/403/429) и FEATURE_ATELIER=false — до БД", async () => {
    const db = new FakeAteliers(atelier());
    assert.equal((await review(db, { authorize: async () => DENY_401 }).call(APPROVE)).status, 401);
    const forbidden: AdminApiAuth = { ok: false, response: apiError("FORBIDDEN", "Недостаточно прав", 403) };
    assert.equal((await review(db, { authorize: async () => forbidden }).call(APPROVE)).status, 403);
    assert.equal((await review(db, { featureAtelier: false }).call(APPROVE)).status, 404);
    assert.deepEqual(db.calls, []);
  });
});
