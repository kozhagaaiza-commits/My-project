import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { legalFormatErrors } from "@/lib/legal";

// Проверка формата реквизитов продавца перед сборкой (next.config.ts): ИНН — 10 или 12 цифр, email — адрес.

describe("legalFormatErrors", () => {
  it("пустые значения не проверяются форматом (их ловит emptyLegalConstants)", () => {
    assert.deepEqual(legalFormatErrors({ SELLER_INN: "", SELLER_EMAIL: "" }), []);
  });
  it("ИНН ИП (12 цифр) и юрлица (10 цифр), корректный email → ошибок нет", () => {
    assert.deepEqual(legalFormatErrors({ SELLER_INN: "771234567890", SELLER_EMAIL: "info@forgecarbon.ru" }), []);
    assert.deepEqual(legalFormatErrors({ SELLER_INN: "7712345678", SELLER_EMAIL: "info@forgecarbon.ru" }), []);
  });
  it("ИНН не 10/12 цифр, email без домена → ошибки по обоим полям", () => {
    for (const inn of ["77123456789", "7712 345678", "77123456789O", "1234567890123"]) {
      assert.deepEqual(legalFormatErrors({ SELLER_INN: inn, SELLER_EMAIL: "" }), ["SELLER_INN: 10 или 12 цифр"], inn);
    }
    for (const email of ["info", "info@forgecarbon", "in fo@forgecarbon.ru", "@forgecarbon.ru"]) {
      assert.deepEqual(legalFormatErrors({ SELLER_INN: "", SELLER_EMAIL: email }), ["SELLER_EMAIL: адрес вида name@example.ru"], email);
    }
  });
  it("реальные значения legal.ts проходят проверку формата", () => {
    assert.deepEqual(legalFormatErrors(), []);
  });
});
