import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCsp, securityHeaders } from "./security-headers";

const PROD = { production: true, supabaseUrl: "https://abcdefghijklmnop.supabase.co" };

describe("securityHeaders (5.10)", () => {
  it("production: пять заголовков Чертежа дословно + CSP", () => {
    const h = Object.fromEntries(securityHeaders(PROD).map((e) => [e.key, e.value]));
    assert.equal(h["X-Frame-Options"], "DENY");
    assert.equal(h["X-Content-Type-Options"], "nosniff");
    assert.equal(h["Referrer-Policy"], "strict-origin-when-cross-origin");
    assert.equal(h["Permissions-Policy"], "camera=(), microphone=(), geolocation=()");
    assert.equal(h["Strict-Transport-Security"], "max-age=63072000; includeSubDomains");
    assert.ok(h["Content-Security-Policy"]);
  });

  it("dev: без HSTS", () => {
    assert.equal(securityHeaders({ production: false }).some((e) => e.key === "Strict-Transport-Security"), false);
  });

  it("CSP: Метрика, Supabase Storage, запрет фреймов и плагинов", () => {
    const csp = buildCsp(PROD);
    assert.match(csp, /script-src [^;]*https:\/\/mc\.yandex\.ru/);
    assert.match(csp, /img-src [^;]*https:\/\/abcdefghijklmnop\.supabase\.co/);
    assert.match(csp, /connect-src [^;]*https:\/\/mc\.yandex\.ru/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'self'/);
    assert.match(csp, /upgrade-insecure-requests/);
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.doesNotMatch(csp, /ws:/);
  });

  it("CSP dev: unsafe-eval и ws:// для HMR; supabaseUrl пуст или не URL → *.supabase.co", () => {
    const csp = buildCsp({ production: false, supabaseUrl: "не url" });
    assert.match(csp, /'unsafe-eval'/);
    assert.match(csp, /ws:\/\/localhost:\*/);
    assert.match(csp, /https:\/\/\*\.supabase\.co/);
    assert.doesNotMatch(csp, /upgrade-insecure-requests/);
  });
});
