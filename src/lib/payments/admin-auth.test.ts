import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { apiError } from "@/lib/api-error";
import { createAuthorizeAdminApi, type AdminAuthDeps } from "@/lib/payments/admin-auth";

// Временная проверка админа для возврата (до requireAdminApi из src/lib/admin/guard.ts): 401 → 403 → Origin → лимит.

const ADMIN = "9f1c2b3a-4d5e-4f60-8a7b-1c2d3e4f5a6b";
const post = (method = "POST") => new Request("http://localhost:3000/api/admin/orders/x/refund", { method });

function setup(over: Partial<AdminAuthDeps> & { userId?: string | null; role?: string | null } = {}) {
  const calls: string[] = [];
  const authorize = createAuthorizeAdminApi({
    getSession: async () => { calls.push("session"); return { userId: over.userId === undefined ? ADMIN : over.userId, role: over.role === undefined ? "admin" : over.role }; },
    assertSameOrigin: (r) => { calls.push("origin"); return (over.assertSameOrigin ?? (() => null))(r); },
    checkRateLimit: async (k, l, s) => { calls.push(`rate:${k}:${l}:${s}`); return (over.checkRateLimit ?? (async () => true))(k, l, s); },
  });
  return { calls, authorize };
}

const errorOf = async (r: { ok: boolean; response?: Response }) => (r.ok ? null : [r.response?.status, await r.response?.json()]);

afterEach(() => mock.restoreAll());

describe("admin-auth (временная обёртка)", () => {
  it("нет сессии → 401, не admin → 403 — до Origin и лимита", async () => {
    const a = setup({ userId: null });
    assert.deepEqual(await errorOf(await a.authorize(post())), [401, { error: { code: "UNAUTHORIZED", message: "Войдите в аккаунт" } }]);
    assert.deepEqual(a.calls, ["session"]);
    const b = setup({ role: "customer" });
    assert.deepEqual(await errorOf(await b.authorize(post())), [403, { error: { code: "FORBIDDEN", message: "Недостаточно прав" } }]);
    assert.deepEqual(b.calls, ["session"]);
  });

  it("Origin проверяется на POST (403), на GET — нет", async () => {
    const bad = setup({ assertSameOrigin: () => apiError("FORBIDDEN", "Недопустимый источник запроса", 403) });
    assert.deepEqual(await errorOf(await bad.authorize(post())), [403, { error: { code: "FORBIDDEN", message: "Недопустимый источник запроса" } }]);
    assert.deepEqual(bad.calls, ["session", "origin"]);
    const get = setup({ assertSameOrigin: () => apiError("FORBIDDEN", "x", 403) });
    assert.equal((await get.authorize(post("GET"))).ok, true);
    assert.ok(!get.calls.includes("origin"));
  });

  it("лимит admin:<user.id> 300 / 60 с → 429 + Retry-After; сбой хранилища — пропуск (fail-open)", async () => {
    const limited = setup({ checkRateLimit: async () => false });
    const r = await limited.authorize(post());
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.response.headers.get("Retry-After"), "60");
    assert.deepEqual(await r.response.json(), { error: { code: "RATE_LIMITED", message: "Слишком много запросов. Повторите через минуту", details: { retry_after_seconds: 60 } } });
    assert.deepEqual(limited.calls, ["session", "origin", `rate:admin:${ADMIN}:300:60`]);

    mock.method(console, "error", () => {});
    const down = setup({ checkRateLimit: async () => { throw new Error("check_rate_limit: 08006"); } });
    assert.deepEqual(await down.authorize(post()), { ok: true, admin: { userId: ADMIN } });
  });
});
