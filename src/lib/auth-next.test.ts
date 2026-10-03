import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextQuery, safeNextPath } from "./auth-next";

describe("safeNextPath", () => {
  it("относительные пути проходят", () => {
    assert.equal(safeNextPath("/atelier"), "/atelier");
    assert.equal(safeNextPath("/orders/FC-26-000123?x=1"), "/orders/FC-26-000123?x=1");
  });
  it("абсолютные URL, //, /\\, управляющие символы и пустое → /account", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "javascript:alert(1)", "", "evil", "/a b", null, undefined]) {
      assert.equal(safeNextPath(bad), "/account", String(bad));
    }
  });
  it("fallback", () => assert.equal(safeNextPath("//x", "/admin"), "/admin"));
  it("nextQuery", () => {
    assert.equal(nextQuery("/atelier"), "?next=%2Fatelier");
    assert.equal(nextQuery("//evil"), "");
    assert.equal(nextQuery("/account"), "");
  });
});
