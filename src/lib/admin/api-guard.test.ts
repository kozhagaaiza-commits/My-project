import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { ADMIN_RATE_LIMIT, authorizeAdminApi, authorizeAdminApiWith, requireAdminApi, type AdminApiDeps } from "@/lib/admin/api-guard";
import { isAllowedOrigin } from "@/lib/csrf";

// Проверка /api/admin/* (api-guard.ts, реэкспорт из guard.ts; 3.0, 5.10, A27; Edge Case 23): 401 → 403 → Origin на мутациях → 300 / 60 с на пользователя.

const USER = { id: "5d1e7a3c-8b2f-4c6d-9e0a-1f3b5c7d9e21", email: "owner@forgecarbon.ru" };
const SITE = "http://localhost:3000";

function deps(over: Partial<AdminApiDeps> = {}) {
  const calls: string[] = [];
  const keys: Array<[string, number, number]> = [];
  const d: AdminApiDeps = {
    getSession: async () => { calls.push("session"); return { user: USER, role: "admin" }; },
    assertSameOrigin: (r) => {
      calls.push("origin");
      return isAllowedOrigin(r.headers.get("origin"), SITE, "production") ? null : Response.json({ error: { code: "FORBIDDEN", message: "Недопустимый источник запроса" } }, { status: 403 });
    },
    checkRateLimit: async (k, l, w) => { calls.push("rate"); keys.push([k, l, w]); return true; },
    ...over,
  };
  return { d, calls, keys };
}

const req = (method: string, origin: string | null = SITE) =>
  new Request(`${SITE}/api/admin/orders`, { method, headers: origin ? { origin } : {} });

describe("authorizeAdminApiWith", () => {
  afterEach(() => mock.restoreAll());

  it("admin, GET: без проверки Origin; лимит admin:<user.id> 300 / 60", async () => {
    const { d, calls, keys } = deps();
    const r = await authorizeAdminApiWith(d, req("GET", null));
    assert.deepEqual(r, { ok: true, admin: { userId: USER.id, email: USER.email } });
    assert.deepEqual(calls, ["session", "rate"]);
    assert.deepEqual(keys, [[`admin:${USER.id}`, 300, 60]]);
    assert.deepEqual(ADMIN_RATE_LIMIT, { limit: 300, windowSeconds: 60 });
  });

  it("без сессии → 401 «Войдите в аккаунт», дальше не идёт", async () => {
    const { d, calls } = deps({ getSession: async () => ({ user: null, role: null }) });
    const r = await authorizeAdminApiWith(d, req("PATCH", "https://evil.example"));
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.response.status, 401);
    assert.deepEqual(await r.response.json(), { error: { code: "UNAUTHORIZED", message: "Войдите в аккаунт" } });
    assert.deepEqual(calls, []);
  });

  for (const role of ["customer", "atelier", null]) {
    it(`роль ${role} → 403 «Недостаточно прав» (Edge Case 23)`, async () => {
      const { d, calls } = deps({ getSession: async () => ({ user: USER, role }) });
      const r = await authorizeAdminApiWith(d, req("GET"));
      assert.equal(r.ok, false);
      if (r.ok) return;
      assert.equal(r.response.status, 403);
      assert.deepEqual(await r.response.json(), { error: { code: "FORBIDDEN", message: "Недостаточно прав" } });
      assert.deepEqual(calls, []);
    });
  }

  it("мутация с чужим Origin или без него → 403, лимит не тратится", async () => {
    for (const origin of ["https://evil.example", null]) {
      const { d, calls } = deps();
      const r = await authorizeAdminApiWith(d, req("PATCH", origin));
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.response.status, 403);
      assert.deepEqual(calls, ["session", "origin"]);
    }
  });

  it("мутация со своим Origin проходит; {mutation:true} проверяет Origin и у GET", async () => {
    assert.equal((await authorizeAdminApiWith(deps().d, req("POST"))).ok, true);
    const { d, calls } = deps();
    const r = await authorizeAdminApiWith(d, req("GET", "https://evil.example"), { mutation: true });
    assert.equal(r.ok, false);
    assert.deepEqual(calls, ["session", "origin"]);
  });

  it("лимит превышен → 429 RATE_LIMITED с Retry-After: 60", async () => {
    const { d } = deps({ checkRateLimit: async () => false });
    const r = await authorizeAdminApiWith(d, req("GET"));
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.response.status, 429);
    assert.equal(r.response.headers.get("Retry-After"), "60");
    assert.deepEqual(await r.response.json(), {
      error: { code: "RATE_LIMITED", message: "Слишком много запросов. Повторите через минуту", details: { retry_after_seconds: 60 } },
    });
  });

  it("сбой хранилища лимитов → fail-open с логом", async () => {
    const err = mock.method(console, "error", () => {});
    const { d } = deps({ checkRateLimit: async () => { throw new Error("rpc down"); } });
    assert.equal((await authorizeAdminApiWith(d, req("GET"))).ok, true);
    assert.equal((err.mock.calls[0].arguments[0] as { scope: string }).scope, "admin.rate-limit");
  });

  it("сбой проверки сессии пробрасывается (обработчик отвечает 500)", async () => {
    const { d } = deps({ getSession: async () => { throw new Error("auth down"); } });
    await assert.rejects(authorizeAdminApiWith(d, req("GET")));
  });
});

describe("authorizeAdminApi: dev-подмена ADMIN_FIXTURES=1 вне production", () => {
  const saved = { fixtures: process.env.ADMIN_FIXTURES, env: process.env.NODE_ENV };
  afterEach(() => {
    if (saved.fixtures === undefined) delete process.env.ADMIN_FIXTURES; else process.env.ADMIN_FIXTURES = saved.fixtures;
    (process.env as Record<string, string | undefined>).NODE_ENV = saved.env;
  });

  it("GET — фиктивный админ без сессии; мутация — Origin всё равно проверяется", async () => {
    process.env.ADMIN_FIXTURES = "1";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    const r = await authorizeAdminApi(req("GET", null));
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.admin.userId, "00000000-0000-4000-8000-000000000001");
    const denied = await requireAdminApi(req("PATCH", "https://evil.example"));
    assert.equal(denied?.status, 403);
    assert.equal(await requireAdminApi(req("PATCH", SITE)), null);
  });
});
