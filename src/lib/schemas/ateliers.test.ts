import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminAteliersQuery, atelierApplyBody, atelierReviewBody, isValidInn } from "@/lib/schemas/ateliers";

// Схемы «Опт для ателье» (Блок 3, 5.1): контрольная сумма ИНН ФНС, сайт только http/https, решение админа.

const BODY = {
  company_name: "Garage 77", inn: "7707083893", city: "Санкт-Петербург", contact_name: "Илья Ветров", phone: "+7 921 300-40-50",
  website: "https://vk.com/garage77spb", comment: null,
};

describe("isValidInn", () => {
  it("10 и 12 цифр по алгоритму ФНС", () => {
    assert.equal(isValidInn("7707083893"), true);
    assert.equal(isValidInn("500100732259"), true);
    assert.equal(isValidInn("7707083894"), false);
    assert.equal(isValidInn("500100732258"), false);
    assert.equal(isValidInn("12345"), false);
  });
});

describe("atelierApplyBody", () => {
  it("валидная заявка: телефон нормализуется к +7XXXXXXXXXX", () => {
    const r = atelierApplyBody.parse(BODY);
    assert.equal(r.phone, "+79213004050");
  });
  it("ИНН: формат и контрольная сумма — тексты Чертежа", () => {
    const f = (inn: string) => atelierApplyBody.safeParse({ ...BODY, inn }).error?.issues[0]?.message;
    assert.equal(f("78012345"), "ИНН — 10 или 12 цифр");
    assert.equal(f("7801234567"), "Проверьте ИНН — контрольная сумма не совпадает");
  });
  it("сайт: null допустим; javascript:/data:/без схемы — нет", () => {
    assert.ok(atelierApplyBody.safeParse({ ...BODY, website: null }).success);
    for (const w of ["javascript:alert(1)", "data:text/html,x", "vk.com/garage77", "ftp://garage77.ru", ""]) {
      assert.equal(atelierApplyBody.safeParse({ ...BODY, website: w }).success, false, w);
    }
  });
  it("комментарий > 1000 и название < 2 → ошибка", () => {
    assert.equal(atelierApplyBody.safeParse({ ...BODY, comment: "x".repeat(1001) }).success, false);
    assert.equal(atelierApplyBody.safeParse({ ...BODY, company_name: "G" }).success, false);
  });
});

describe("atelierReviewBody / adminAteliersQuery", () => {
  it("approved только с null; rejected — причина 10–500", () => {
    assert.ok(atelierReviewBody.safeParse({ status: "approved", rejection_reason: null }).success);
    assert.equal(atelierReviewBody.safeParse({ status: "approved", rejection_reason: "текст" }).success, false);
    assert.equal(atelierReviewBody.safeParse({ status: "rejected", rejection_reason: "коротко" }).success, false);
    assert.equal(atelierReviewBody.safeParse({ status: "rejected", rejection_reason: "x".repeat(501) }).success, false);
  });
  it("query: статус необязателен, page по умолчанию 1", () => {
    assert.deepEqual(adminAteliersQuery.parse({}), { page: 1 });
    assert.equal(adminAteliersQuery.safeParse({ status: "archived" }).success, false);
  });
});
