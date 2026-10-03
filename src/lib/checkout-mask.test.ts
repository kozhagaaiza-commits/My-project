import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyPhoneMask, applyPostalMask, applyUpperMask } from "@/lib/checkout-mask";

describe("applyPhoneMask", () => {
  it("первая цифра → «+7 (9», дальше по маске +7 (999) 999-99-99", () => {
    assert.equal(applyPhoneMask("9"), "+7 (9");
    assert.equal(applyPhoneMask("916"), "+7 (916)");
    assert.equal(applyPhoneMask("9165"), "+7 (916) 5");
    assert.equal(applyPhoneMask("916555"), "+7 (916) 555");
    assert.equal(applyPhoneMask("9165551"), "+7 (916) 555-1");
    assert.equal(applyPhoneMask("916555123"), "+7 (916) 555-12-3");
    assert.equal(applyPhoneMask("9165551234"), "+7 (916) 555-12-34");
  });
  it("вставка 8…, 7…, +7… и лишние цифры нормализуются", () => {
    assert.equal(applyPhoneMask("89165551234"), "+7 (916) 555-12-34");
    assert.equal(applyPhoneMask("79165551234"), "+7 (916) 555-12-34");
    assert.equal(applyPhoneMask("+7 916 555-12-34"), "+7 (916) 555-12-34");
    assert.equal(applyPhoneMask("+7 (916) 555-12-34567"), "+7 (916) 555-12-34");
  });
  it("не-цифры игнорируются; пустой ввод — пусто", () => {
    assert.equal(applyPhoneMask("abc"), "");
    assert.equal(applyPhoneMask(""), "");
    assert.equal(applyPhoneMask("+"), "");
  });
  it("ввод 8 или 7 первым даёт префикс «+7»", () => {
    assert.equal(applyPhoneMask("8"), "+7");
    assert.equal(applyPhoneMask("7"), "+7");
  });
  it("удаление: стёртый символ маски убирает последнюю цифру, обычное удаление — как есть", () => {
    assert.equal(applyPhoneMask("+7 (916", "+7 (916)"), "+7 (91");
    assert.equal(applyPhoneMask("+7 (916) 555-1", "+7 (916) 555-12"), "+7 (916) 555-1");
    assert.equal(applyPhoneMask("+7 (916) 5551", "+7 (916) 555-1"), "+7 (916) 555");
    assert.equal(applyPhoneMask("+7 (916) 555-", "+7 (916) 555-1"), "+7 (916) 555");
    assert.equal(applyPhoneMask("+7 (", "+7 (9"), "");
    assert.equal(applyPhoneMask("+", "+7"), "");
    assert.equal(applyPhoneMask("", "+7 (9"), "");
  });
});

describe("applyPostalMask / applyUpperMask", () => {
  it("индекс — только цифры, до 6", () => {
    assert.equal(applyPostalMask("12a345 678"), "123456");
  });
  it("верхний регистр без пробелов (VIN, код ПВЗ)", () => {
    assert.equal(applyUpperMask("wba ja11050b123456"), "WBAJA11050B123456");
  });
});
