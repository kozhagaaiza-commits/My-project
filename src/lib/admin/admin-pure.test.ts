import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminDeliveryLabel, adminVehicleLabel } from "@/lib/admin/labels";
import { buildMetaPatch } from "@/lib/admin/meta-patch";
import { orderMoney } from "@/lib/admin/order-view";
import { orderSearchFilter, phoneSearchDigits } from "@/lib/admin/orders-search";
import { epochMicros, sameInstant, toIsoUtc } from "@/lib/admin/timestamps";
import { orderMetaPatchBody } from "@/lib/schemas/admin-orders";

// Чистые функции админки: метки времени, поиск, подписи, суммы, сборка патча.

describe("timestamps", () => {
  it("toIsoUtc: PostgREST-формат → «Z» с микросекундами; без дроби → .000Z; смещение учитывается", () => {
    assert.equal(toIsoUtc("2026-10-01T15:02:44.123456+00:00"), "2026-10-01T15:02:44.123456Z");
    assert.equal(toIsoUtc("2026-10-01T15:02:44+00:00"), "2026-10-01T15:02:44.000Z");
    assert.equal(toIsoUtc("2026-10-01 18:02:44.5+03"), "2026-10-01T15:02:44.500Z");
    assert.equal(toIsoUtc("2026-10-01T15:02:44.123Z"), "2026-10-01T15:02:44.123Z");
    assert.equal(toIsoUtc("not a date"), "not a date");
  });

  it("sameInstant: микросекунды значимы, формат — нет", () => {
    assert.ok(sameInstant("2026-10-01T15:02:44.123456+00:00", "2026-10-01T15:02:44.123456Z"));
    assert.ok(sameInstant("2026-10-01T18:02:44.1234+03:00", "2026-10-01T15:02:44.123400Z"));
    assert.ok(!sameInstant("2026-10-01T15:02:44.123456+00:00", "2026-10-01T15:02:44.123Z"));
    assert.ok(!sameInstant("garbage", "garbage"));
    assert.equal(epochMicros("1970-01-01T00:00:00.000001Z"), 1);
  });
});

describe("orderSearchFilter", () => {
  it("номер, email, телефон, часть email; LIKE-символы экранируются", () => {
    assert.deepEqual(orderSearchFilter("fc-26-0009"), { kind: "ilike", column: "number", pattern: "%FC-26-0009%" });
    assert.deepEqual(orderSearchFilter("a_b%@x.ru"), { kind: "ilike", column: "customer_email", pattern: "%a\\_b\\%@x.ru%" });
    assert.deepEqual(orderSearchFilter("+7 916 555-12-34"), { kind: "or", filter: "number.ilike.%79165551234%,customer_phone.ilike.%79165551234%" });
    assert.deepEqual(orderSearchFilter("000123"), { kind: "or", filter: "number.ilike.%000123%,customer_phone.ilike.%000123%" });
    assert.deepEqual(orderSearchFilter("yandex.ru"), { kind: "ilike", column: "customer_email", pattern: "%yandex.ru%" });
    assert.deepEqual(orderSearchFilter("( 1)"), { kind: "ilike", column: "number", pattern: "%( 1)%" });
  });

  it("в .or() попадают только цифры (синтаксис PostgREST не сломать)", () => {
    const f = orderSearchFilter("8(916)555,12.34");
    assert.equal(f.kind, "ilike"); // запятая и точка — не телефон
    assert.equal(phoneSearchDigits("8 916 555 12 34"), "79165551234");
    assert.equal(phoneSearchDigits("916 555"), "916555");
  });
});

describe("подписи", () => {
  it("доставка: пример Блока 3 и остальные способы", () => {
    assert.equal(adminDeliveryLabel({ delivery_method: "cdek_pvz", delivery_city: "Казань", cdek_pvz_code: "KZN45" }), "СДЭК ПВЗ · Казань · KZN45");
    assert.equal(adminDeliveryLabel({ delivery_method: "cdek_door", delivery_city: "Казань", cdek_pvz_code: null }), "СДЭК до двери · Казань");
    assert.equal(adminDeliveryLabel({ delivery_method: "moscow_courier", delivery_city: "Москва", cdek_pvz_code: null }), "Курьер по Москве · Москва");
  });

  it("авто: «BMW 5 Series G30 · 2017–2023»; без авто — null", () => {
    assert.equal(adminVehicleLabel({ make: "BMW", model: "5 Series", generation: "G30", year_from: 2017, year_to: 2023 }), "BMW 5 Series G30 · 2017–2023");
    assert.equal(adminVehicleLabel(null), null);
  });
});

describe("orderMoney (BR-16)", () => {
  it("двойная оплата с автовозвратом: refundable = одна оплата", () => {
    assert.deepEqual(orderMoney(
      [{ status: "succeeded", amount: 100 }, { status: "succeeded", amount: 100 }, { status: "canceled", amount: 100 }],
      [{ status: "succeeded", amount: 100 }],
    ), { paid_amount: 200, refunded_amount: 100, refundable_amount: 100 });
  });

  it("не уходит в минус", () => {
    assert.equal(orderMoney([], [{ status: "pending", amount: 5 }]).refundable_amount, 0);
  });
});

describe("buildMetaPatch", () => {
  it("только переданные поля; '' → null", () => {
    const body = orderMetaPatchBody.parse({ customer_visible_note: "  ", admin_note: "x", needs_attention: false, updated_at: "2026-10-20T08:00:00.000Z" });
    assert.deepEqual(buildMetaPatch(body), { customer_visible_note: null, admin_note: "x", needs_attention: false });
    assert.deepEqual(buildMetaPatch(orderMetaPatchBody.parse({ updated_at: "2026-10-20T08:00:00.000Z" })), {});
  });
});
