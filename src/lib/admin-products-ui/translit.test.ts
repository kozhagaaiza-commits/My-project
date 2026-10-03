import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SLUG_MAX, slugifyTitle } from "./translit";

describe("slugifyTitle", () => {
  it("транслитерирует русское название и «×»", () => {
    assert.equal(slugifyTitle("Кованый моноблок M-01 R20, 5×112, графит"), "kovanyy-monoblok-m-01-r20-5x112-grafit");
  });
  it("многобуквенные соответствия и мягкие знаки", () => {
    assert.equal(slugifyTitle("Щётка шёлк объём"), "shchetka-shelk-obem");
    assert.equal(slugifyTitle("Хром Цвет Чёрный Юла Яма"), "khrom-tsvet-chernyy-yula-yama");
  });
  it("схлопывает мусор и обрезает дефисы по краям", () => {
    assert.equal(slugifyTitle("  --Диффузор (карбон)!!  "), "diffuzor-karbon");
    assert.equal(slugifyTitle("***"), "");
  });
  it("результат подходит под regex схемы и не длиннее лимита", () => {
    const slug = slugifyTitle("Очень длинное название ".repeat(20));
    assert.ok(slug.length <= SLUG_MAX);
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});
