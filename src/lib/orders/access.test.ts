import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { OrderAccessRow } from "@/lib/orders/db";
import { applyTestEnv } from "@/test/env";

// verifyOrderAccess (Блок 3 GET/POST pay, Блок 5.10, Edge Case 22): токен / владелец / admin;
// «нет заказа» и «неверный токен» неразличимы.

let access: typeof import("@/lib/orders/access");
let token: typeof import("@/lib/orders/token");
before(async () => {
  applyTestEnv();
  access = await import("@/lib/orders/access");
  token = await import("@/lib/orders/token");
});

const NUMBER = "FC-26-000123";
const OWNER = "5d1e7a3c-8b2f-4c6d-9e0a-1f3b5c7d9e21";
const OTHER = "6e2f8b4d-9c3a-4d7e-a01b-2a4c6d8e0f32";
const TOKEN = "Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU";
const WRONG = "Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeV";

function row(over: Partial<OrderAccessRow> = {}): OrderAccessRow {
  return {
    id: "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68", number: NUMBER, status: "pending_payment", kind: "stock",
    user_id: null, public_token_hash: token.hashOrderToken(TOKEN), reserved_until: "2026-10-01T13:00:00+00:00", total: 13370000,
    ...over,
  };
}

function deps(order: OrderAccessRow | null) {
  const calls: string[] = [];
  return { calls, selectOrder: async (n: string) => { calls.push(n); return order && order.number === n ? order : null; } };
}

const guest = { userId: null, role: null };

describe("verifyOrderAccess", () => {
  it("верный токен → доступ via token", async () => {
    const order = row();
    const res = await access.verifyOrderAccess({ number: NUMBER, token: TOKEN, ctx: guest }, deps(order));
    assert.deepEqual(res, { found: true, order, via: "token" });
  });

  it("сессия владельца без токена → via owner", async () => {
    const order = row({ user_id: OWNER });
    const res = await access.verifyOrderAccess({ number: NUMBER, ctx: { userId: OWNER, role: "customer" } }, deps(order));
    assert.deepEqual(res, { found: true, order, via: "owner" });
  });

  it("чужая сессия без токена → не найден; гостевой заказ (user_id null) не открывается любым гостем", async () => {
    const res1 = await access.verifyOrderAccess({ number: NUMBER, ctx: { userId: OTHER, role: "customer" } }, deps(row({ user_id: OWNER })));
    const res2 = await access.verifyOrderAccess({ number: NUMBER, ctx: guest }, deps(row()));
    assert.deepEqual(res1, { found: false });
    assert.deepEqual(res2, { found: false });
  });

  it("admin → via admin; при allowAdmin: false (POST /pay) — не найден", async () => {
    const order = row({ user_id: OWNER });
    const admin = { userId: OTHER, role: "admin" };
    assert.deepEqual(await access.verifyOrderAccess({ number: NUMBER, ctx: admin }, deps(order)), { found: true, order, via: "admin" });
    assert.deepEqual(await access.verifyOrderAccess({ number: NUMBER, ctx: admin, allowAdmin: false }, deps(order)), { found: false });
  });

  it("токен важнее сессии: владелец с верным токеном → via token", async () => {
    const order = row({ user_id: OWNER });
    const res = await access.verifyOrderAccess({ number: NUMBER, token: TOKEN, ctx: { userId: OWNER, role: "customer" } }, deps(order));
    assert.equal(res.found && res.via, "token");
  });

  it("неверный токен = несуществующий заказ: одинаковый результат", async () => {
    const wrong = await access.verifyOrderAccess({ number: NUMBER, token: WRONG, ctx: guest }, deps(row()));
    const missing = await access.verifyOrderAccess({ number: "FC-26-000999", token: TOKEN, ctx: guest }, deps(row()));
    const noToken = await access.verifyOrderAccess({ number: NUMBER, ctx: guest }, deps(row()));
    assert.deepEqual(wrong, { found: false });
    assert.deepEqual(missing, wrong);
    assert.deepEqual(noToken, wrong);
  });

  it("токен одного заказа не открывает другой", async () => {
    const other = row({ number: "FC-26-000124", public_token_hash: token.hashOrderToken(WRONG) });
    const res = await access.verifyOrderAccess({ number: "FC-26-000124", token: TOKEN, ctx: guest }, deps(other));
    assert.deepEqual(res, { found: false });
  });

  it("битый формат номера → не найден без запроса в БД", async () => {
    for (const number of ["FC-26-12", "fc-26-000123", "FC-26-000123/../x", ""]) {
      const d = deps(row());
      assert.deepEqual(await access.verifyOrderAccess({ number, token: TOKEN, ctx: guest }, d), { found: false });
      assert.deepEqual(d.calls, []);
    }
  });

  it("токен не по формату (не 32 символа / чужие символы) игнорируется: владелец всё равно проходит", async () => {
    const order = row({ user_id: OWNER });
    for (const bad of [`${TOKEN}x`, TOKEN.slice(0, 31), `${TOKEN.slice(0, 31)}=`]) {
      assert.deepEqual(await access.verifyOrderAccess({ number: NUMBER, token: bad, ctx: guest }, deps(order)), { found: false });
      const res = await access.verifyOrderAccess({ number: NUMBER, token: bad, ctx: { userId: OWNER, role: "customer" } }, deps(order));
      assert.equal(res.found && res.via, "owner");
    }
  });
});
