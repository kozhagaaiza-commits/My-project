import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expectedDeliveryText, expectedReadyText, formatDateRange, formatDay, formatReserveRemaining, formatStepDate,
  reserveText,
} from "@/lib/order-page-format";

const NOW = new Date("2026-10-03T09:00:00.000Z");

describe("formatStepDate (МСК, dd.MM HH:mm)", () => {
  it("UTC → Москва (+3)", () => assert.equal(formatStepDate("2026-10-01T12:34:10.000Z"), "01.10 15:34"));
  it("переход через полночь по Москве", () => assert.equal(formatStepDate("2026-10-01T21:05:00.000Z"), "02.10 00:05"));
  it("null и мусор → пусто", () => {
    assert.equal(formatStepDate(null), "");
    assert.equal(formatStepDate("не дата"), "");
  });
});

describe("formatDateRange", () => {
  it("один месяц: «4–7 октября»", () => assert.equal(formatDateRange("2026-10-04", "2026-10-07", NOW), "4–7 октября"));
  it("разные месяцы: «30 октября – 3 ноября»", () =>
    assert.equal(formatDateRange("2026-10-30", "2026-11-03", NOW), "30 октября – 3 ноября"));
  it("одна и та же дата — без диапазона", () => assert.equal(formatDateRange("2026-10-04", "2026-10-04", NOW), "4 октября"));
  it("другой год добавляется: «31 декабря 2026 – 2 января 2027»", () =>
    assert.equal(formatDateRange("2026-12-31", "2027-01-02", NOW), "31 декабря 2026 – 2 января 2027"));
  it("диапазон в следующем году целиком — год в конце", () =>
    assert.equal(formatDateRange("2027-01-04", "2027-01-07", NOW), "4–7 января 2027"));
  it("перепутанные границы не дают «7–4»", () => assert.equal(formatDateRange("2026-10-07", "2026-10-04", NOW), "4 октября"));
  it("некорректные даты → null", () => {
    assert.equal(formatDateRange("2026-13-01", "2026-10-04", NOW), null);
    assert.equal(formatDateRange("2026-02-30", "2026-03-04", NOW), null);
    assert.equal(formatDateRange("x", "y", NOW), null);
  });
  it("падежи месяцев (родительный)", () => {
    assert.equal(formatDay("2026-03-08", NOW), "8 марта");
    assert.equal(formatDay("2026-08-31", NOW), "31 августа");
    assert.equal(formatDay("2026-05-01", NOW), "1 мая");
  });
});

describe("тексты ожидаемых дат", () => {
  it("«Ожидаемая доставка: 4–7 октября»", () =>
    assert.equal(expectedDeliveryText({ from: "2026-10-04", to: "2026-10-07" }, NOW), "Ожидаемая доставка: 4–7 октября"));
  it("нет диапазона → null", () => assert.equal(expectedDeliveryText(null, NOW), null));
  it("«Ожидаем на складе к 5 ноября»", () => assert.equal(expectedReadyText("2026-11-05", NOW), "Ожидаем на складе к 5 ноября"));
  it("нет даты → null", () => assert.equal(expectedReadyText(null, NOW), null));
  it("без сдвига часового пояса: 1 января остаётся 1 января", () => assert.equal(formatDay("2027-01-01", new Date("2027-01-01T00:30:00+03:00")), "1 января"));
});

describe("таймер брони", () => {
  const at = (minutes: number, extraSec = 0) => new Date(NOW.getTime() + minutes * 60_000 + extraSec * 1000).toISOString();
  it("«18 мин» — остаток округляется вверх", () => {
    assert.equal(formatReserveRemaining(at(18), NOW), "18 мин");
    assert.equal(formatReserveRemaining(at(17, 20), NOW), "18 мин");
    assert.equal(reserveText(at(18), NOW), "Бронь действует ещё 18 мин");
  });
  it("1 мин и меньше минуты", () => {
    assert.equal(formatReserveRemaining(at(1), NOW), "1 мин");
    assert.equal(formatReserveRemaining(at(0, 30), NOW), "меньше минуты");
  });
  it("час и больше: «1 ч», «1 ч 5 мин»", () => {
    assert.equal(formatReserveRemaining(at(60), NOW), "1 ч");
    assert.equal(formatReserveRemaining(at(65), NOW), "1 ч 5 мин");
  });
  it("истекла или нет даты → null", () => {
    assert.equal(formatReserveRemaining(at(0), NOW), null);
    assert.equal(formatReserveRemaining(at(-5), NOW), null);
    assert.equal(formatReserveRemaining(null, NOW), null);
    assert.equal(formatReserveRemaining("мусор", NOW), null);
    assert.equal(reserveText(at(-1), NOW), null);
  });
});
