import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kopecksToPriceInput, minorToInput, parseMoneyToMinor, parseNumberField } from "./money-input";

describe("parseMoneyToMinor", () => {
  it("целые и дробные суммы без float", () => {
    assert.equal(parseMoneyToMinor("800"), 80000);
    assert.equal(parseMoneyToMinor("800.5"), 80050);
    assert.equal(parseMoneyToMinor("800,05"), 80005);
    assert.equal(parseMoneyToMinor("133 700.00"), 13370000);
    assert.equal(parseMoneyToMinor("0.29"), 29);
  });
  it("мусор и пустая строка — undefined", () => {
    for (const bad of ["", "abc", "1.234", "-5", "1e3", "12,"]) assert.equal(parseMoneyToMinor(bad), undefined, bad);
  });
});

describe("minorToInput / kopecksToPriceInput", () => {
  it("обратное преобразование", () => {
    assert.equal(minorToInput(80000), "800.00");
    assert.equal(minorToInput(5), "0.05");
    assert.equal(minorToInput(null), "");
    assert.equal(kopecksToPriceInput(13370000), "133700");
    assert.equal(kopecksToPriceInput(13370050), "133700.50");
  });
});

describe("parseNumberField", () => {
  it("пусто — null, мусор — undefined, число — число", () => {
    assert.equal(parseNumberField(""), null);
    assert.equal(parseNumberField("  "), null);
    assert.equal(parseNumberField("8,5"), 8.5);
    assert.equal(parseNumberField("-20"), -20);
    assert.equal(parseNumberField("x"), undefined);
  });
});
