import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loginBody, profileBody, registerBody, updatePasswordBody } from "./auth";

describe("схемы аутентификации", () => {
  it("пароль: 8–72, буква и цифра", () => {
    const r = (password: string) => registerBody.safeParse({ full_name: "Артём", email: "a@b.ru", password }).success;
    assert.equal(r("abc12345"), true);
    assert.equal(r("пароль123"), true);
    assert.equal(r("abcdefgh"), false);
    assert.equal(r("12345678"), false);
    assert.equal(r("ab1"), false);
    assert.equal(r("a1".repeat(37)), false);
  });
  it("повтор пароля", () => {
    const res = updatePasswordBody.safeParse({ password: "abc12345", password_repeat: "abc12346" });
    assert.equal(res.success, false);
    assert.equal(res.error?.issues[0]?.message, "Пароли не совпадают");
  });
  it("вход: email нормализуется, пароль непустой", () => {
    const res = loginBody.safeParse({ email: " A@B.RU ", password: "x" });
    assert.equal(res.success && res.data.email, "a@b.ru");
    assert.equal(loginBody.safeParse({ email: "a@b.ru", password: "" }).success, false);
  });
  it("профиль: пустой телефон → null, телефон нормализуется", () => {
    assert.equal(profileBody.parse({ full_name: "Артём", phone: "" }).phone, null);
    assert.equal(profileBody.parse({ full_name: "Артём", phone: "+7 (916) 555-12-34" }).phone, "+79165551234");
    assert.equal(profileBody.safeParse({ full_name: "А", phone: "" }).success, false);
  });
});
