import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAtelierApplyHandler, type AtelierApplyDeps } from "@/app/api/ateliers/handler";
import { createMyAtelierHandler } from "@/app/api/ateliers/me/handler";
import { apiError } from "@/lib/api-error";
import { AT_ID, FakeAteliers, INN, USER, atelier } from "@/lib/ateliers/__fixtures__/fake";
import type { AtelierApplyBody } from "@/lib/schemas/ateliers";

// GET /api/ateliers/me и POST /api/ateliers на in-memory подмене (Блок 3 «Аккаунт и ателье», US-009, BR-20, 5.10).

const BODY = {
  company_name: "Garage 77", inn: INN, city: "Санкт-Петербург", contact_name: "Илья Ветров", phone: "+7 921 300-40-50",
  website: "https://vk.com/garage77spb", comment: "Ставим диски и обвесы на BMW и Audi, 15–20 машин в месяц",
};

const post = (body: unknown, origin: string | null = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/ateliers", {
    method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
  });

function setup(db: FakeAteliers, over: Partial<AtelierApplyDeps> = {}) {
  const notified: AtelierApplyBody[] = [];
  const limits: string[] = [];
  const deps: AtelierApplyDeps = {
    featureAtelier: true,
    assertSameOrigin: (r) => (r.headers.get("origin") === "http://localhost:3000" ? null : apiError("FORBIDDEN", "Недопустимый источник запроса", 403)),
    getSession: async () => db.session(),
    limitApply: async (u) => { limits.push(u); return null; },
    notifyApplied: async (a) => { notified.push(a); },
    ...over,
  };
  return { POST: createAtelierApplyHandler(deps), notified, limits };
}

describe("GET /api/ateliers/me", () => {
  const me = (db: FakeAteliers, over: { featureAtelier?: boolean; guest?: boolean } = {}) =>
    createMyAtelierHandler({ featureAtelier: over.featureAtelier ?? true, getSession: async () => (over.guest ? null : db.session()) })();

  it("заявка есть → JSON Блока 3; private, no-store", async () => {
    const res = await me(new FakeAteliers(atelier()));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await res.json(), { data: {
      id: AT_ID, company_name: "Garage 77", inn: INN, city: "Санкт-Петербург", status: "pending", status_label: "На рассмотрении",
      rejection_reason: null, created_at: "2026-10-01T14:20:00.000Z",
    } });
  });
  it("отклонена → причина и подпись «Отклонена»", async () => {
    const res = await me(new FakeAteliers(atelier({ status: "rejected", rejection_reason: "Не нашли информации об ателье" })));
    const { data } = await res.json();
    assert.equal(data.status_label, "Отклонена");
    assert.equal(data.rejection_reason, "Не нашли информации об ателье");
  });
  it("заявки нет → { data: null }", async () => {
    assert.deepEqual(await (await me(new FakeAteliers())).json(), { data: null });
  });
  it("гость → 401; FEATURE_ATELIER=false → 404 FEATURE_DISABLED до сессии", async () => {
    assert.equal((await me(new FakeAteliers(), { guest: true })).status, 401);
    const db = new FakeAteliers(atelier());
    const off = await me(db, { featureAtelier: false });
    assert.equal(off.status, 404);
    assert.deepEqual(await off.json(), { error: { code: "FEATURE_DISABLED", message: "Раздел для ателье скоро откроется" } });
    assert.deepEqual(db.calls, []);
  });
  it("сбой БД → 500 без деталей", async () => {
    const db = new FakeAteliers();
    db.fail.find = new Error("db down");
    const res = await me(db);
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error.code, "INTERNAL_ERROR");
  });
});

describe("POST /api/ateliers", () => {
  it("новая заявка → 201 Блока 3, телефон нормализован, admin_atelier_applied, лимит по user.id", async () => {
    const db = new FakeAteliers();
    const { POST, notified, limits } = setup(db);
    const res = await POST(post(BODY));
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { data: { id: AT_ID, status: "pending", status_label: "На рассмотрении" } });
    assert.equal(db.rows.get(AT_ID)?.phone, "+79213004050");
    assert.equal(db.rows.get(AT_ID)?.user_id, USER);
    assert.deepEqual(notified.map((n) => [n.company_name, n.inn, n.city]), [["Garage 77", INN, "Санкт-Петербург"]]);
    assert.deepEqual(limits, [USER]);
  });

  it("user_id из тела игнорируется — только сессия", async () => {
    const db = new FakeAteliers();
    await setup(db).POST(post({ ...BODY, user_id: "00000000-0000-4000-8000-000000000000", status: "approved" }));
    assert.equal(db.rows.get(AT_ID)?.user_id, USER);
    assert.equal(db.rows.get(AT_ID)?.status, "pending");
  });

  it("неверная контрольная сумма ИНН → 400 с текстом Блока 3; лимит не расходуется", async () => {
    const { POST, limits } = setup(new FakeAteliers());
    const res = await POST(post({ ...BODY, inn: "7801234567" }));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: { code: "VALIDATION_ERROR", message: "Проверьте поля формы", details: { fields: { inn: ["Проверьте ИНН — контрольная сумма не совпадает"] } } } });
    assert.deepEqual(limits, []);
  });

  it("website javascript: → 400; битый JSON → 400", async () => {
    const { POST } = setup(new FakeAteliers());
    const bad = await (await POST(post({ ...BODY, website: "javascript:alert(1)" }))).json();
    assert.ok(bad.error.details.fields.website);
    assert.equal((await POST(post("{oops"))).status, 400);
  });

  it("заявка на рассмотрении → 409 ALREADY_APPLIED «Заявка уже на рассмотрении», без уведомления", async () => {
    const { POST, notified } = setup(new FakeAteliers(atelier()));
    const res = await POST(post(BODY));
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: { code: "ALREADY_APPLIED", message: "Заявка уже на рассмотрении" } });
    assert.equal(notified.length, 0);
  });

  it("одобрена → 409 ALREADY_APPLIED «Заявка уже одобрена»", async () => {
    const res = await setup(new FakeAteliers(atelier({ status: "approved" }))).POST(post(BODY));
    assert.deepEqual(await res.json(), { error: { code: "ALREADY_APPLIED", message: "Заявка уже одобрена" } });
  });

  it("повторная подача после отказа → pending, причина сброшена, тот же id, админу уведомление", async () => {
    const db = new FakeAteliers(atelier({ status: "rejected", rejection_reason: "Нет сайта", reviewed_at: "2026-10-02T09:00:00Z" }));
    const { POST, notified } = setup(db);
    const res = await POST(post({ ...BODY, website: "https://garage77.ru" }));
    assert.equal(res.status, 201);
    assert.equal((await res.json()).data.id, AT_ID);
    const row = db.rows.get(AT_ID);
    assert.equal(row?.status, "pending");
    assert.equal(row?.rejection_reason, null);
    assert.equal(row?.reviewed_at, null);
    assert.equal(row?.website, "https://garage77.ru");
    assert.equal(notified.length, 1);
    assert.deepEqual(db.calls, ["find", "resubmit"]);
  });

  it("гонка двух подач (23505) → 409 ALREADY_APPLIED", async () => {
    const db = new FakeAteliers();
    const s = db.session();
    const insert = s.repo.insert;
    s.repo.find = async () => null; // первая проверка не видит строку параллельной подачи
    s.repo.insert = async (b) => { await insert(b); return insert(b); };
    const res = await setup(db, { getSession: async () => s }).POST(post(BODY));
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.code, "ALREADY_APPLIED");
  });

  it("лимит 3/час → 429 из limitApply; запись не создаётся", async () => {
    const db = new FakeAteliers();
    const limited = apiError("RATE_LIMITED", "Слишком много заявок. Повторите через час", 429, { retry_after_seconds: 3600 });
    const res = await setup(db, { limitApply: async () => limited }).POST(post(BODY));
    assert.equal(res.status, 429);
    assert.equal(db.rows.size, 0);
  });

  it("порядок: FEATURE_ATELIER → Origin → сессия", async () => {
    const db = new FakeAteliers();
    const off = await setup(db, { featureAtelier: false }).POST(post(BODY, null));
    assert.equal(off.status, 404);
    assert.equal((await off.json()).error.code, "FEATURE_DISABLED");
    assert.equal((await setup(db, { getSession: async () => null }).POST(post(BODY, "https://evil.example"))).status, 403);
    assert.equal((await setup(db, { getSession: async () => null }).POST(post(BODY))).status, 401);
    assert.equal(db.rows.size, 0);
  });

  it("сбой лимитов (fail-closed) или БД → 500, private, no-store", async () => {
    const res = await setup(new FakeAteliers(), { limitApply: async () => { throw new Error("rate table down"); } }).POST(post(BODY));
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    const db = new FakeAteliers();
    db.fail.insert = new Error("boom");
    assert.equal((await setup(db).POST(post(BODY))).status, 500);
  });
});
