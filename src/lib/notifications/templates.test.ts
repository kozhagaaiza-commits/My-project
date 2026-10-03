import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRub } from "@/lib/money";
import { buildCustomerStatusChangedPayload } from "@/lib/notifications/payloads";
import { renderNotification, templateChannels, type RenderedMessage } from "@/lib/notifications/templates";
import { NOTIFICATION_TEMPLATES, type NotificationPayloads } from "@/lib/notifications/types";

const TOTAL = formatRub(13370000); // «133 700 ₽»
const SITE = "https://forgecarbon.vercel.app";
const ADMIN_URL = `${SITE}/admin/orders/4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68`;
const ORDER_URL = `${SITE}/orders/FC-26-000123?t=Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU`;

const PAYLOADS: NotificationPayloads = {
  admin_order_paid: {
    order_id: "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68", order_number: "FC-26-000123", total: 13370000, total_formatted: TOTAL,
    items: [{ title: "Кованый моноблок M-01 R20", quantity: 1 }], vehicle_label: "BMW 5 Series G30", vin: "WBAJA11050B123456",
    delivery_label: "Казань · СДЭК ПВЗ KZN45", admin_url: ADMIN_URL, needs_attention: false,
  },
  admin_attention: {
    order_id: "4b9e2c7a", order_number: "FC-26-000123", kind: "paid_needs_attention",
    reason: "Оплачен после истечения брони; Не хватило остатка", admin_url: ADMIN_URL,
  },
  admin_atelier_applied: { company_name: "Garage 77", inn: "7801234567", city: "Санкт-Петербург" },
  customer_order_paid: {
    order_number: "FC-26-000123", kind: "stock", total: 13370000, total_formatted: TOTAL,
    items: [{ title: "Кованый моноблок M-01 R20", quantity: 1, line_total: 13370000, line_total_formatted: TOTAL }],
    delivery_method_label: "СДЭК — пункт выдачи", delivery_label: "Казань · СДЭК ПВЗ KZN45", order_url: ORDER_URL,
  },
  customer_status_changed: {
    order_number: "FC-26-000123", status: "shipped", status_label: "Передан в доставку", tracking_number: "1234567890",
    tracking_url: "https://www.cdek.ru/ru/tracking?order_id=1234567890", order_url: ORDER_URL,
  },
  customer_refund: { order_number: "FC-26-000123", amount: 13370000, amount_formatted: TOTAL, order_url: ORDER_URL },
  atelier_approved: { company_name: "Garage 77" },
  atelier_rejected: { company_name: "Garage 77", rejection_reason: "ИНН не найден в реестре" },
};

const tg = (template: string, payload: unknown): string => {
  const r = renderNotification({ template, channel: "telegram", payload });
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.equal(r.message.channel, "telegram");
  return (r.message as Extract<RenderedMessage, { channel: "telegram" }>).text;
};
const mail = (template: string, payload: unknown) => {
  const r = renderNotification({ template, channel: "email", payload });
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.equal(r.message.channel, "email");
  return r.message as Extract<RenderedMessage, { channel: "email" }>;
};

describe("шаблоны 5.9.2: Telegram — golden-тексты", () => {
  it("admin_order_paid", () => {
    assert.equal(tg("admin_order_paid", PAYLOADS.admin_order_paid), [
      `💳 Оплачен заказ <b>FC-26-000123</b> · ${TOTAL}`,
      "Кованый моноблок M-01 R20 ×1",
      "BMW 5 Series G30 · VIN WBAJA11050B123456",
      "Казань · СДЭК ПВЗ KZN45",
      `<a href="${ADMIN_URL}">Открыть заказ</a>`,
    ].join("\n"));
  });

  it("admin_order_paid: несколько позиций; авто без VIN; нет авто — строка не выводится", () => {
    const p = { ...PAYLOADS.admin_order_paid, items: [{ title: "Диск A", quantity: 2 }, { title: "Диффузор B", quantity: 1 }], vin: null };
    const lines = tg("admin_order_paid", p).split("\n");
    assert.deepEqual(lines.slice(1, 4), ["Диск A ×2", "Диффузор B ×1", "BMW 5 Series G30"]);
    const none = tg("admin_order_paid", { ...p, vehicle_label: null, vin: null }).split("\n");
    assert.equal(none.length, 5);
    assert.equal(none[3], "Казань · СДЭК ПВЗ KZN45");
  });

  it("admin_attention: первая строка дословно из таблицы; для payment_create_failed — «Ошибка создания платежа»", () => {
    const [first, second] = tg("admin_attention", PAYLOADS.admin_attention).split("\n");
    assert.equal(first, "⚠️ Заказ <b>FC-26-000123</b> требует внимания: Оплачен после истечения брони; Не хватило остатка");
    assert.equal(second, `<a href="${ADMIN_URL}">Открыть заказ</a>`);
    const failed = tg("admin_attention", { ...PAYLOADS.admin_attention, kind: "payment_create_failed", reason: "Receipt is invalid" });
    assert.equal(failed.split("\n")[0], "Ошибка создания платежа FC-26-000123: Receipt is invalid");
  });

  it("admin_atelier_applied", () => {
    assert.equal(tg("admin_atelier_applied", PAYLOADS.admin_atelier_applied), "🏁 Новая заявка ателье: Garage 77, ИНН 7801234567, Санкт-Петербург");
  });

  it("customer_status_changed: shipped с треком; другие статусы — без трека", () => {
    assert.equal(
      tg("customer_status_changed", PAYLOADS.customer_status_changed),
      "Заказ FC-26-000123: Передан в доставку. Трек СДЭК: 1234567890\nОтследить: https://www.cdek.ru/ru/tracking?order_id=1234567890",
    );
    assert.equal(
      tg("customer_status_changed", buildCustomerStatusChangedPayload({ orderNumber: "FC-26-000123", status: "confirmed", trackingNumber: "1234567890", orderUrl: ORDER_URL })),
      "Заказ FC-26-000123: Проверен инженером",
    );
    // shipped без трека (курьер по Москве)
    assert.equal(
      tg("customer_status_changed", buildCustomerStatusChangedPayload({ orderNumber: "FC-26-000123", status: "shipped", trackingNumber: null, orderUrl: null })),
      "Заказ FC-26-000123: Передан в доставку",
    );
  });

  it("customer_refund", () => {
    assert.equal(
      tg("customer_refund", PAYLOADS.customer_refund),
      `По заказу FC-26-000123 оформлен возврат ${TOTAL}. Срок зачисления зависит от банка, обычно до 10 рабочих дней`,
    );
  });
});

describe("шаблоны 5.9.2: письма", () => {
  it("customer_order_paid: тема, состав, сумма, доставка, фраза про инженера, кнопка «Статус заказа»", () => {
    const m = mail("customer_order_paid", PAYLOADS.customer_order_paid);
    assert.equal(m.subject, "Заказ FC-26-000123 оплачен");
    assert.match(m.text, /Кованый моноблок M-01 R20 ×1/);
    assert.ok(m.text.includes(`Итого: ${TOTAL}`));
    assert.match(m.text, /Доставка: СДЭК — пункт выдачи · Казань · СДЭК ПВЗ KZN45/);
    assert.match(m.text, /Инженер проверит совместимость и передаст заказ в доставку/);
    assert.ok(m.text.includes(`Статус заказа: ${ORDER_URL}`));
    assert.match(m.html, /Статус заказа<\/a>/);
    assert.ok(m.html.includes(`href="${ORDER_URL}"`));
  });

  it("вёрстка: таблицы, фон #0A0A0B, текст #F2F2F3, кнопка #E6FF00 с тёмным текстом", () => {
    const { html } = mail("customer_order_paid", PAYLOADS.customer_order_paid);
    assert.match(html, /<table/);
    assert.match(html, /#0A0A0B/);
    assert.match(html, /#F2F2F3/);
    assert.match(html, /bgcolor="#E6FF00"/);
    assert.match(html, /color:#0A0A0B;text-decoration:none/);
    assert.doesNotMatch(html, /<script|<style|<div/i);
  });

  it("customer_status_changed (email): тема и текст", () => {
    const m = mail("customer_status_changed", PAYLOADS.customer_status_changed);
    assert.equal(m.subject, "Заказ FC-26-000123: Передан в доставку");
    assert.match(m.text, /Заказ FC-26-000123: Передан в доставку\. Трек СДЭК: 1234567890/);
    assert.ok(m.text.includes("Статус заказа: " + ORDER_URL));
  });

  it("customer_refund (email)", () => {
    const m = mail("customer_refund", { ...PAYLOADS.customer_refund, order_url: null });
    assert.equal(m.subject, "Возврат по заказу FC-26-000123");
    assert.match(m.text, /Срок зачисления зависит от банка, обычно до 10 рабочих дней/);
    assert.doesNotMatch(m.html, /<a /);
  });

  it("atelier_approved / atelier_rejected", () => {
    const ok = mail("atelier_approved", PAYLOADS.atelier_approved);
    assert.equal(ok.subject, "Заявка Garage 77 одобрена");
    assert.ok(ok.text.includes("Заявка Garage 77 одобрена. Цены для ателье доступны после входа на сайт"));
    const no = mail("atelier_rejected", PAYLOADS.atelier_rejected);
    assert.equal(no.subject, "Заявка Garage 77 отклонена");
    assert.ok(no.text.includes("Заявка Garage 77 отклонена. Причина: ИНН не найден в реестре. Вы можете подать её повторно"));
  });
});

describe("все 8 шаблонов", () => {
  it("каждый шаблон рендерится хотя бы в одном канале; каналы соответствуют таблице 5.9.2", () => {
    for (const t of NOTIFICATION_TEMPLATES) {
      const channels = templateChannels(t);
      assert.ok(channels.length > 0, t);
      for (const ch of channels) {
        const r = renderNotification({ template: t, channel: ch, payload: PAYLOADS[t] });
        assert.ok(r.ok, `${t}/${ch}: ${r.ok ? "" : r.error}`);
      }
    }
    assert.deepEqual([...templateChannels("admin_order_paid")], ["telegram"]);
    assert.deepEqual([...templateChannels("atelier_approved")], ["email"]);
    assert.ok(templateChannels("customer_refund").includes("email") && templateChannels("customer_refund").includes("telegram"));
  });

  it("шаблон не поддерживает чужой канал", () => {
    const r = renderNotification({ template: "admin_order_paid", channel: "email", payload: PAYLOADS.admin_order_paid });
    assert.equal(r.ok, false);
  });
});

describe("экранирование HTML-инъекций", () => {
  const evil = `<script>alert(1)</script> & "q" <a href="x">`;

  it("Telegram: название товара, авто, адрес, причина, ателье", () => {
    const paid = tg("admin_order_paid", {
      ...PAYLOADS.admin_order_paid, items: [{ title: evil, quantity: 1 }], vehicle_label: evil, delivery_label: evil,
    });
    assert.doesNotMatch(paid, /<script>/);
    assert.ok(paid.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;"));
    assert.equal((paid.match(/<a /g) ?? []).length, 1); // только наша ссылка «Открыть заказ»

    const attention = tg("admin_attention", { ...PAYLOADS.admin_attention, reason: evil });
    assert.doesNotMatch(attention, /<script>/);
    const atelier = tg("admin_atelier_applied", { company_name: evil, inn: "<b>1</b>", city: "<i>" });
    assert.doesNotMatch(atelier, /<script>|<b>|<i>/);
  });

  it("письма: HTML экранирован, текстовая версия — как есть", () => {
    const m = mail("customer_order_paid", {
      ...PAYLOADS.customer_order_paid,
      items: [{ title: evil, quantity: 1, line_total: 1, line_total_formatted: "<b>1 ₽</b>" }],
      delivery_label: evil,
    });
    assert.doesNotMatch(m.html, /<script>/);
    assert.doesNotMatch(m.html, /<b>1/);
    assert.ok(m.html.includes("&lt;script&gt;"));
    assert.ok(m.text.includes("<script>")); // text/plain не интерпретирует HTML
    const rej = mail("atelier_rejected", { company_name: evil, rejection_reason: evil });
    assert.doesNotMatch(rej.html, /<script>/);
  });

  it("кавычка в ссылке не выходит из атрибута href", () => {
    const r = renderNotification({
      template: "admin_order_paid", channel: "telegram",
      payload: { ...PAYLOADS.admin_order_paid, admin_url: `https://x.test/a"onmouseover="alert(1)` },
    });
    assert.equal(r.ok, false); // кавычка недопустима в ссылке (Zod)
  });

  it("& в ссылке экранируется как &amp;", () => {
    const text = tg("admin_order_paid", { ...PAYLOADS.admin_order_paid, admin_url: "https://x.test/a?b=1&c=2" });
    assert.ok(text.includes(`href="https://x.test/a?b=1&amp;c=2"`));
  });

  it("тема письма — одна строка (нет перевода строк)", () => {
    const m = mail("atelier_approved", { company_name: "Garage\r\nBcc: evil@x.test" });
    assert.ok(!/[\r\n]/.test(m.subject));
  });
});

describe("битый payload и неизвестные значения не бросают", () => {
  it("null / строка / пропущенные поля → ok:false с описанием", () => {
    for (const payload of [null, "text", 42, {}, { order_number: "FC-1" }]) {
      const r = renderNotification({ template: "customer_order_paid", channel: "email", payload });
      assert.equal(r.ok, false);
      assert.match(r.ok ? "" : r.error, /некорректный payload/);
    }
  });

  it("javascript:-ссылка отклоняется", () => {
    const r = renderNotification({ template: "customer_order_paid", channel: "email", payload: { ...PAYLOADS.customer_order_paid, order_url: "javascript:alert(1)" } });
    assert.equal(r.ok, false);
  });

  it("неизвестный шаблон и канал", () => {
    assert.equal(renderNotification({ template: "nope", channel: "email", payload: {} }).ok, false);
    assert.equal(renderNotification({ template: "customer_refund", channel: "sms", payload: PAYLOADS.customer_refund }).ok, false);
    assert.equal(renderNotification({ template: undefined, channel: undefined, payload: undefined }).ok, false);
  });
});
