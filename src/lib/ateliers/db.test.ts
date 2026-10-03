import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mockDb, selects } from "@/lib/admin/__fixtures__/mock-db";
import {
  ADMIN_ATELIER_COLUMNS, ORDERS_COUNT_PAGE, OWN_ATELIER_COLUMNS, countAtelierOrders, existsOtherApprovedInn, insertAtelier, resubmitAtelier,
  selectAdminAteliers, selectOwnAtelier, selectUserEmail, updateAtelierReview, updateProfileRole,
} from "@/lib/ateliers/db";
import type { Db } from "@/lib/catalog/db";
import { DbError } from "@/lib/orders/errors";
import { adminAteliersQuery, atelierApplyBody } from "@/lib/schemas/ateliers";

// Слой БД ateliers на мок-клиенте: явные колонки (никогда *), user_id только из аргумента, условия на прежний статус.

const USER = "3f6b1c2d-8e4a-4b7c-9d1e-2a5f7c9e1b30";
const ID = "e1c7a3b9-5d2f-4e8a-9b06-3f1d7c2e8a54";
const OTHER = "b2d4f6a8-0c1e-4a3b-8d5f-7e9a1c3b5d70";
const BODY = atelierApplyBody.parse({
  company_name: "Garage 77", inn: "7707083893", city: "Санкт-Петербург", contact_name: "Илья Ветров", phone: "8 921 300 40 50",
  website: null, comment: null,
});
const ROW = {
  id: ID, user_id: USER, company_name: "Garage 77", inn: "7707083893", city: "Санкт-Петербург", contact_name: "Илья Ветров",
  phone: "+79213004050", website: null, comment: null, status: "pending", rejection_reason: null, reviewed_at: null,
  created_at: "2026-10-01T14:20:00+00:00",
};

describe("ateliers db: своя заявка (сессия)", () => {
  it("selectOwnAtelier: явные колонки, фильтр user_id, maybeSingle", async () => {
    const { db, calls } = mockDb(() => ({ data: { ...ROW } }));
    const r = await selectOwnAtelier(db, USER);
    assert.equal(r?.id, ID);
    assert.deepEqual(calls[0].ops, [["select", OWN_ATELIER_COLUMNS], ["eq", "user_id", USER], ["maybeSingle"]]);
  });

  it("insertAtelier: status pending, телефон нормализован; 23505 → DbError с pgCode", async () => {
    const { db, calls } = mockDb(() => ({ data: { id: ID } }));
    assert.equal(await insertAtelier(db, USER, BODY), ID);
    const ins = calls[0].ops[0][1] as Record<string, unknown>;
    assert.equal(ins.user_id, USER);
    assert.equal(ins.status, "pending");
    assert.equal(ins.phone, "+79213004050");
    const dup = mockDb(() => ({ error: { code: "23505", message: "duplicate key" } }));
    await assert.rejects(insertAtelier(dup.db, USER, BODY), (e: unknown) => e instanceof DbError && e.pgCode === "23505");
  });

  it("resubmitAtelier: только своя rejected-строка, сброс причины; 0 строк → null", async () => {
    const { db, calls } = mockDb(() => ({ data: null }));
    assert.equal(await resubmitAtelier(db, ID, USER, BODY), null);
    const ops = calls[0].ops;
    assert.deepEqual(ops[0], ["update", { ...BODY, status: "pending", rejection_reason: null, reviewed_at: null }]);
    assert.deepEqual(ops.slice(1, 4), [["eq", "id", ID], ["eq", "user_id", USER], ["eq", "status", "rejected"]]);
  });
});

describe("ateliers db: админка (service-role)", () => {
  it("список: колонки, фильтр статуса, новые сверху, страница 2 = range(20, 39)", async () => {
    const { db, calls } = mockDb(() => ({ data: [ROW], count: 21 }));
    const res = await selectAdminAteliers(db, adminAteliersQuery.parse({ status: "pending", page: "2" }));
    assert.equal(res.total, 21);
    assert.deepEqual(calls[0].ops, [
      ["select", ADMIN_ATELIER_COLUMNS, { count: "exact" }], ["eq", "status", "pending"],
      ["order", "created_at", { ascending: false }], ["order", "id", { ascending: false }], ["range", 20, 39],
    ]);
    assert.ok(!selects(calls).some((s) => s.includes("*")));
  });

  it("страница за концом (PGRST103) → пустой список и total из head-запроса", async () => {
    const { db } = mockDb((_t, ops) => (ops.some((o) => o[0] === "range")
      ? { error: { code: "PGRST103", message: "Requested range not satisfiable" } } : { count: 3 }));
    assert.deepEqual(await selectAdminAteliers(db, adminAteliersQuery.parse({ page: "9" })), { rows: [], total: 3 });
  });

  it("orders_count — один запрос по списку id, подсчёт по atelier_id; пустой список — без запроса", async () => {
    const a = mockDb(() => ({ data: [{ atelier_id: ID }, { atelier_id: ID }, { atelier_id: USER }] }));
    const counts = await countAtelierOrders(a.db, [ID, USER, OTHER]);
    assert.deepEqual([...counts], [[ID, 2], [USER, 1], [OTHER, 0]]);
    assert.deepEqual(a.calls, [{ table: "orders", ops: [["select", "atelier_id"], ["in", "atelier_id", [ID, USER, OTHER]], ["order", "id"], ["range", 0, 999]] }]);
    const empty = mockDb(() => ({ data: [] }));
    assert.equal((await countAtelierOrders(empty.db, [])).size, 0);
    assert.equal(empty.calls.length, 0);
  });

  it("orders_count: полная страница (1000) → следующая страница", async () => {
    let n = 0;
    const p = mockDb(() => ({ data: Array.from({ length: n++ === 0 ? ORDERS_COUNT_PAGE : 3 }, () => ({ atelier_id: ID })) }));
    assert.equal((await countAtelierOrders(p.db, [ID])).get(ID), ORDERS_COUNT_PAGE + 3);
    assert.deepEqual(p.calls.map((c) => c.ops.at(-1)), [["range", 0, 999], ["range", 1000, 1999]]);
  });

  it("проверка ИНН — head-запрос", async () => {
    const b = mockDb(() => ({ count: 1 }));
    assert.equal(await existsOtherApprovedInn(b.db, "7707083893", ID), true);
    assert.deepEqual(b.calls[0].ops.slice(1), [["eq", "inn", "7707083893"], ["eq", "status", "approved"], ["neq", "id", ID]]);
  });

  it("updateAtelierReview: условие на прежний статус; 0 строк → null", async () => {
    const { db, calls } = mockDb(() => ({ data: null }));
    const patch = { status: "approved" as const, rejection_reason: null, reviewed_at: "2026-10-02T09:00:00.000Z" };
    assert.equal(await updateAtelierReview(db, ID, "pending", patch), null);
    assert.deepEqual(calls[0].ops.slice(0, 3), [["update", patch], ["eq", "id", ID], ["eq", "status", "pending"]]);
  });

  it("updateProfileRole: только из перечисленных ролей", async () => {
    const { db, calls } = mockDb(() => ({ data: [{ id: USER }] }));
    assert.equal(await updateProfileRole(db, USER, "atelier", ["customer"]), 1);
    assert.deepEqual(calls[0], { table: "profiles", ops: [["update", { role: "atelier" }], ["eq", "id", USER], ["in", "role", ["customer"]], ["select", "id"]] });
  });

  it("selectUserEmail: auth.admin.getUserById; 404 → null; прочая ошибка → исключение", async () => {
    const fake = (res: unknown) => ({ auth: { admin: { getUserById: async () => res } } }) as unknown as Db;
    assert.equal(await selectUserEmail(fake({ data: { user: { email: "ilya@garage77.ru" } }, error: null }), USER), "ilya@garage77.ru");
    assert.equal(await selectUserEmail(fake({ data: { user: null }, error: { status: 404, message: "User not found" } }), USER), null);
    await assert.rejects(selectUserEmail(fake({ data: { user: null }, error: { status: 500, message: "boom" } }), USER));
  });
});
