import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { before, describe, it } from "node:test";
import { applyTestEnv } from "@/test/env";

// Токен заказа (Блок 5.10, решение A28): orderToken = первые 32 символа base64url HMAC-SHA256(ORDER_TOKEN_SECRET,
// lower(client_request_id)); в БД — только SHA-256 токена в hex; сравнение timingSafeEqual.

let t: typeof import("@/lib/orders/token");
before(async () => {
  applyTestEnv();
  t = await import("@/lib/orders/token");
});

const SECRET = "s3cr3t-for-tests-0123456789abcdefghij";
const CRID = "0e7c4a19-5b2d-4f8e-9a63-1d0c8b7e2f45";
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

describe("orderToken (A28)", () => {
  it("детерминирован: тот же client_request_id и секрет → тот же токен", () => {
    assert.equal(t.orderToken(CRID, SECRET), t.orderToken(CRID, SECRET));
  });

  it("алгоритм: первые 32 символа base64url HMAC-SHA256(секрет, client_request_id)", () => {
    const expected = createHmac("sha256", SECRET).update(CRID).digest("base64url").slice(0, 32);
    assert.equal(t.orderToken(CRID, SECRET), expected);
  });

  it("без явного секрета берёт ORDER_TOKEN_SECRET из env", () => {
    assert.equal(t.orderToken(CRID), t.orderToken(CRID, process.env.ORDER_TOKEN_SECRET));
    assert.notEqual(t.orderToken(CRID), t.orderToken(CRID, SECRET));
  });

  it("длина 32 и только [A-Za-z0-9_-] (формат orderTokenQuery Блока 3) на 500 случайных uuid", () => {
    for (let i = 0; i < 500; i++) {
      const token = t.orderToken(randomUUID(), SECRET);
      assert.equal(token.length, 32);
      assert.match(token, TOKEN_RE);
    }
  });

  it("разные client_request_id → разные токены; другой секрет → другой токен", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => t.orderToken(randomUUID(), SECRET)));
    assert.equal(tokens.size, 200);
    assert.notEqual(t.orderToken(CRID, SECRET), t.orderToken(CRID, `${SECRET}x`));
  });

  it("регистр uuid не влияет на токен", () => {
    assert.equal(t.orderToken(CRID.toUpperCase(), SECRET), t.orderToken(CRID, SECRET));
  });
});

describe("hashOrderToken / tokenMatchesHash", () => {
  const token = "Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU";

  it("hash — SHA-256 токена, 64 hex (CHECK orders.public_token_hash)", () => {
    const h = t.hashOrderToken(token);
    assert.match(h, /^[a-f0-9]{64}$/);
    assert.equal(h, createHash("sha256").update(token).digest("hex"));
  });

  it("верный токен совпадает с хэшем, неверный — нет", () => {
    const h = t.hashOrderToken(token);
    assert.equal(t.tokenMatchesHash(token, h), true);
    assert.equal(t.tokenMatchesHash(`${token.slice(0, 31)}V`, h), false);
    assert.equal(t.tokenMatchesHash(token.toLowerCase(), h), false);
  });

  it("хэш другой длины / не hex / пустой → false без исключения", () => {
    const h = t.hashOrderToken(token);
    assert.equal(t.tokenMatchesHash(token, h.slice(0, 62)), false);
    assert.equal(t.tokenMatchesHash(token, `${h}00`), false);
    assert.equal(t.tokenMatchesHash(token, "z".repeat(64)), false);
    assert.equal(t.tokenMatchesHash(token, ""), false);
  });

  it("токен восстановим: orderToken(client_request_id) проходит сверку с хэшем, сохранённым при создании", () => {
    const stored = t.hashOrderToken(t.orderToken(CRID, SECRET));
    assert.equal(t.tokenMatchesHash(t.orderToken(CRID, SECRET), stored), true);
    assert.equal(t.tokenMatchesHash(t.orderToken(randomUUID(), SECRET), stored), false);
  });
});

describe("orderPageUrl", () => {
  const token = "Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU";

  it("абсолютная ссылка из примера Блока 3", () => {
    assert.equal(
      t.orderPageUrl("FC-26-000123", token, "https://forgecarbon.vercel.app"),
      "https://forgecarbon.vercel.app/orders/FC-26-000123?t=Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU",
    );
  });

  it("слэш в конце URL сайта не даёт двойного слэша", () => {
    const url = t.orderPageUrl("FC-26-000123", token, "https://forgecarbon.vercel.app/");
    assert.equal(url, "https://forgecarbon.vercel.app/orders/FC-26-000123?t=Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU");
    assert.doesNotMatch(url.replace("https://", ""), /\/\//);
  });

  it("по умолчанию — NEXT_PUBLIC_SITE_URL; токен читается из ?t= без изменений", () => {
    const url = new URL(t.orderPageUrl("FC-26-000123", token));
    assert.equal(url.origin, new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").origin);
    assert.equal(url.pathname, "/orders/FC-26-000123");
    assert.equal(url.searchParams.get("t"), token);
  });
});
