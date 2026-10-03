import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { daysSince, formatDateTime, formatIsoDate, formatRate, pluralRu } from "@/lib/admin-ui/format";
import { isNavActive } from "@/lib/admin-ui/nav";
import { refundFormSchema, settingsFormSchema, shipFormSchema, trackingError } from "@/lib/admin-ui/schemas";
import { specLines } from "@/lib/admin-ui/specs";

const firstMessage = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) => r.error?.issues[0]?.message;

describe("admin-ui format", () => {
  it("pluralRu и даты", () => {
    assert.equal(pluralRu(1, "день", "дня", "дней"), "день");
    assert.equal(pluralRu(3, "день", "дня", "дней"), "дня");
    assert.equal(pluralRu(11, "день", "дня", "дней"), "дней");
    assert.equal(formatIsoDate("2026-10-01"), "01.10.2026");
    assert.equal(formatIsoDate("мусор"), "");
    assert.equal(formatDateTime("2026-10-01T12:30:41.000Z"), "01.10.2026 15:30");
    assert.equal(formatRate(83.56).replace(/\s/g, " "), "83,56 ₽");
  });

  it("daysSince считает по московскому дню", () => {
    assert.equal(daysSince("2026-10-01", new Date("2026-10-04T10:00:00Z")), 3);
    assert.equal(daysSince(null), null);
  });

  it("nav: Сводка активна только на /admin", () => {
    assert.equal(isNavActive("/admin/orders", "/admin"), false);
    assert.equal(isNavActive("/admin/orders/abc", "/admin/orders"), true);
  });

  it("specs: служебный type скрыт, числа с единицами", () => {
    const lines = specLines({ type: "wheel_set", diameter_in: 20, et_front_mm: 30, pcd: "5x112", center_bore_mm: 66.6 });
    assert.deepEqual(lines.map((l) => `${l.label} ${l.value}`), ["Диаметр 20″", "ET перед 30 мм", "PCD 5x112", "ЦО 66,6 мм"]);
  });
});

describe("admin-ui schemas", () => {
  it("ship: СДЭК требует трек, курьер — заметку", () => {
    const cdek = shipFormSchema(true);
    assert.equal(firstMessage(cdek.safeParse({ tracking_number: "", courier_note: "", note: "" })), "Укажите трек-номер СДЭК");
    assert.equal(cdek.safeParse({ tracking_number: "1234567890", courier_note: "", note: "" }).success, true);
    const courier = shipFormSchema(false);
    assert.equal(firstMessage(courier.safeParse({ tracking_number: "", courier_note: "", note: "" })), "Укажите заметку для курьера");
    assert.equal(trackingError("ab"), "Трек-номер: 5–40 символов, латиница, цифры и дефис");
  });

  it("refund: максимум и причина", () => {
    const schema = refundFormSchema(13370000);
    const base = { reason: "Клиент отказался", restock: true };
    assert.equal(schema.safeParse({ ...base, amount: "133700.00" }).success, true);
    assert.equal(schema.safeParse({ ...base, amount: "133 700,5" }).success, false);
    assert.equal(firstMessage(schema.safeParse({ ...base, amount: "133700.01" })).replace(/\s/g, " "), "Максимум к возврату: 133 700 ₽");
    assert.equal(firstMessage(schema.safeParse({ amount: "100", reason: "да", restock: false })), "Минимум 5 символов");
  });

  it("settings: границы множителя и порога", () => {
    const ok = { markup_multiplier: "2.00", price_rounding_rub: "100", auto_reprice: true, reprice_threshold: "2" };
    assert.equal(settingsFormSchema.safeParse(ok).success, true);
    assert.equal(settingsFormSchema.safeParse({ ...ok, markup_multiplier: "5,01" }).success, false);
    assert.equal(settingsFormSchema.safeParse({ ...ok, markup_multiplier: "0.99" }).success, false);
    assert.equal(settingsFormSchema.safeParse({ ...ok, reprice_threshold: "21" }).success, false);
  });
});
