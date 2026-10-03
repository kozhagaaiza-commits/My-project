import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { assertSameOrigin, isAllowedOrigin } from "@/lib/csrf";

const SITE = "https://forgecarbon.ru";

describe("isAllowedOrigin (5.10, A27)", () => {
  it("совпадение с origin NEXT_PUBLIC_SITE_URL (путь и слэш в переменной не мешают)", () => {
    assert.equal(isAllowedOrigin(SITE, SITE, "production"), true);
    assert.equal(isAllowedOrigin(SITE, `${SITE}/`, "production"), true);
    assert.equal(isAllowedOrigin(SITE, `${SITE}/shop?x=1`, "production"), true);
  });
  it("чужой Origin → false (поддомен, другой протокол, другой порт, суффикс)", () => {
    for (const o of ["https://evil.example", "https://www.forgecarbon.ru", "http://forgecarbon.ru",
      "https://forgecarbon.ru:8443", "https://forgecarbon.ru.evil.example"]) {
      assert.equal(isAllowedOrigin(o, SITE, "production"), false, o);
    }
  });
  it("нет Origin или Origin: null → false", () => {
    assert.equal(isAllowedOrigin(null, SITE, "development"), false);
    assert.equal(isAllowedOrigin("", SITE, "development"), false);
    assert.equal(isAllowedOrigin("null", SITE, "development"), false);
  });
  it("dev: localhost и 127.0.0.1 любого порта", () => {
    for (const o of ["http://localhost:3000", "http://localhost:3490", "http://127.0.0.1:5173", "http://localhost"]) {
      assert.equal(isAllowedOrigin(o, SITE, "development"), true, o);
      assert.equal(isAllowedOrigin(o, SITE, undefined), true, o);
      assert.equal(isAllowedOrigin(o, SITE, "test"), true, o);
    }
  });
  it("dev: похожие на localhost адреса не проходят", () => {
    for (const o of ["https://localhost:3000", "http://localhost.evil.example", "http://localhost:3000.evil.example",
      "http://127.0.0.2:3000", "http://evil.example/http://localhost:3000"]) {
      assert.equal(isAllowedOrigin(o, SITE, "development"), false, o);
    }
  });
  it("production: localhost не принимается", () => {
    assert.equal(isAllowedOrigin("http://localhost:3000", SITE, "production"), false);
    assert.equal(isAllowedOrigin("http://127.0.0.1:3000", SITE, "production"), false);
  });
  it("production с localhost-сайтом (локальный next start): принимается только точный origin", () => {
    assert.equal(isAllowedOrigin("http://localhost:3000", "http://localhost:3000", "production"), true);
    assert.equal(isAllowedOrigin("http://localhost:3001", "http://localhost:3000", "production"), false);
  });
  it("NEXT_PUBLIC_SITE_URL не задан или не URL: в production — отказ", () => {
    assert.equal(isAllowedOrigin(SITE, undefined, "production"), false);
    assert.equal(isAllowedOrigin(SITE, "not a url", "production"), false);
  });
});

describe("assertSameOrigin", () => {
  const saved = { site: process.env.NEXT_PUBLIC_SITE_URL, node: process.env.NODE_ENV };
  const env = process.env as Record<string, string | undefined>;
  afterEach(() => {
    env.NEXT_PUBLIC_SITE_URL = saved.site;
    env.NODE_ENV = saved.node;
  });
  const req = (origin?: string) => new Request("https://forgecarbon.ru/api/cart/validate", {
    method: "POST", headers: origin ? { origin } : {},
  });

  it("свой Origin → null", () => {
    env.NEXT_PUBLIC_SITE_URL = SITE;
    env.NODE_ENV = "production";
    assert.equal(assertSameOrigin(req(SITE)), null);
  });
  it("чужой Origin и отсутствие Origin → 403 FORBIDDEN с текстом", async () => {
    env.NEXT_PUBLIC_SITE_URL = SITE;
    env.NODE_ENV = "production";
    for (const r of [req("https://evil.example"), req(), req("http://localhost:3000")]) {
      const res = assertSameOrigin(r);
      assert.ok(res);
      assert.equal(res.status, 403);
      assert.deepEqual(await res.json(), { error: { code: "FORBIDDEN", message: "Недопустимый источник запроса" } });
    }
  });
  it("dev: localhost на другом порту → null", () => {
    env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    env.NODE_ENV = "development";
    assert.equal(assertSameOrigin(req("http://localhost:3490")), null);
    assert.ok(assertSameOrigin(req()));
  });
});
