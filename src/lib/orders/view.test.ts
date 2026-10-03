import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addBusinessDays, buildOrderView, maskEmail, maskPhone, moscowDate,
  type BuildOrderViewInput, type OrderHistoryEntry, type OrderViewOrder,
} from "@/lib/orders/view";

// buildOrderView — чистая сборка OrderView (Блок 3: GET /api/orders/[number]; 5.3; Блок 4 «Статус заказа»).

const TOKEN = "Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU";
const NOW = new Date("2026-10-02T12:00:00.000Z");
// Пробел в выводе formatRub — неразрывный (Intl); сравниваем через тот же форматтер, что и прод.
const rub = (k: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(k / 100);

const order = (over: Partial<OrderViewOrder> = {}): OrderViewOrder => ({
  id: "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68",
  number: "FC-26-000123",
  kind: "stock",
  status: "shipped",
  delivery_method: "cdek_pvz",
  delivery_city: "Казань",
  delivery_address: null,
  cdek_pvz_code: "KZN45",
  total: 13370000,
  reserved_until: "2026-10-01T13:00:00+00:00",
  paid_at: "2026-10-01T12:34:10.123456+00:00",
  expected_ready_at: null,
  shipped_at: "2026-10-02T10:15:00+00:00",
  delivered_at: null,
  cancel_reason: null,
  tracking_number: "1234567890",
  courier_note: null,
  customer_visible_note: null,
  telegram_subscribed: true,
  customer_name: "Артём Соколов",
  customer_email: "artem.sokolov@yandex.ru",
  customer_phone: "+79165551234",
  ...over,
});

const HISTORY: OrderHistoryEntry[] = [
  { to_status: "pending_payment", created_at: "2026-10-01T12:30:00+00:00" },
  { to_status: "paid", created_at: "2026-10-01T12:34:10.123456+00:00" },
  { to_status: "confirmed", created_at: "2026-10-01T15:02:44+00:00" },
  { to_status: "shipped", created_at: "2026-10-02T10:15:00+00:00" },
];

const input = (over: Partial<BuildOrderViewInput> = {}): BuildOrderViewInput => ({
  order: order(),
  items: [{
    title: "Кованый моноблок M-01 R20, 5×112, графит", quantity: 1, unit_price: 13370000, line_total: 13370000,
    product_slug: "forged-m01-r20-5x112-graphite",
  }],
  history: HISTORY,
  refunded_amount: 0,
  now: NOW,
  accessToken: TOKEN,
  telegramBotUsername: "forgecarbon_bot",
  ...over,
});

describe("buildOrderView: пример Блока 3 (stock, shipped, СДЭК ПВЗ, доступ по токену)", () => {
  it("полный ответ", () => {
    assert.deepEqual(buildOrderView(input()), {
      number: "FC-26-000123",
      kind: "stock",
      status: "shipped",
      status_label: "Передан в доставку",
      timeline: [
        { status: "paid", label: "Оплачен", at: "2026-10-01T12:34:10.123Z", done: true },
        { status: "confirmed", label: "Проверен инженером", at: "2026-10-01T15:02:44.000Z", done: true },
        { status: "shipped", label: "Передан в доставку", at: "2026-10-02T10:15:00.000Z", done: true },
        { status: "delivered", label: "Доставлен", at: null, done: false },
      ],
      items: [{
        title: "Кованый моноблок M-01 R20, 5×112, графит", quantity: 1, unit_price_formatted: rub(13370000),
        line_total_formatted: rub(13370000), product_slug: "forged-m01-r20-5x112-graphite",
      }],
      total: 13370000,
      total_formatted: rub(13370000),
      delivery: { method: "cdek_pvz", method_label: "СДЭК — пункт выдачи", city: "Казань", cdek_pvz_code: "KZN45", address: null },
      tracking: { number: "1234567890", url: "https://www.cdek.ru/ru/tracking?order_id=1234567890" },
      courier_note: null,
      // Пт 02.10 + 2…5 рабочих дней: выходные 03–04.10 пропускаются → Вт 06.10 … Пт 09.10.
      expected_delivery: { from: "2026-10-06", to: "2026-10-09" },
      expected_ready_at: null,
      customer_visible_note: null,
      reserved_until: null,
      can_pay: false,
      telegram_subscribed: true,
      telegram_link: `https://t.me/forgecarbon_bot?start=o_${TOKEN}`,
      customer: { name: "Артём Соколов", email_masked: "ar***@yandex.ru", phone_masked: "+7 916 ***-**-34" },
      cancel_reason: null,
      refunded_amount_formatted: null,
    });
    assert.equal(rub(13370000).replace(/\s/g, " "), "133 700 ₽");
  });

  it("без токена (владелец / admin) — telegram_link null", () => {
    assert.equal(buildOrderView(input({ accessToken: null })).telegram_link, null);
  });

  it("в ответе нет служебных полей заказа", () => {
    const keys = JSON.stringify(buildOrderView(input()));
    for (const k of ["id", "public_token_hash", "admin_note", "telegram_chat_id", "client_request_id", "attention_reason", "user_id"]) {
      assert.ok(!keys.includes(`"${k}"`), k);
    }
  });
});

describe("таймлайн по kind", () => {
  it("preorder: 6 шагов, выполнены до текущего статуса включительно", () => {
    const v = buildOrderView(input({
      order: order({ kind: "preorder", status: "in_transit", shipped_at: null, tracking_number: null, expected_ready_at: "2026-11-05" }),
      history: [
        { to_status: "paid", created_at: "2026-10-01T12:34:10Z" },
        { to_status: "ordered_from_supplier", created_at: "2026-10-02T09:00:00Z" },
        { to_status: "in_transit", created_at: "2026-10-10T09:00:00Z" },
      ],
    }));
    assert.deepEqual(v.timeline.map((s) => [s.status, s.done]), [
      ["paid", true], ["ordered_from_supplier", true], ["in_transit", true], ["arrived", false], ["shipped", false], ["delivered", false],
    ]);
    assert.deepEqual(v.timeline.map((s) => s.label), [
      "Оплачен", "Заказан у поставщика", "Едет в Москву", "Прибыл на склад", "Передан в доставку", "Доставлен",
    ]);
    assert.equal(v.timeline[2].at, "2026-10-10T09:00:00.000Z");
    assert.equal(v.timeline[3].at, null);
    assert.equal(v.status_label, "Едет в Москву");
    assert.equal(v.expected_ready_at, "2026-11-05");
    assert.equal(v.expected_delivery, null);
    assert.equal(v.tracking, null);
  });

  it("stock: expected_ready_at не отдаётся", () => {
    assert.equal(buildOrderView(input({ order: order({ expected_ready_at: "2026-11-05" }) })).expected_ready_at, null);
  });

  it("paid без записи истории — время из paid_at; шаг выполнен по статусу", () => {
    const v = buildOrderView(input({ order: order({ status: "paid", shipped_at: null, tracking_number: null }), history: [] }));
    assert.deepEqual(v.timeline[0], { status: "paid", label: "Оплачен", at: "2026-10-01T12:34:10.123Z", done: true });
    assert.ok(v.timeline.slice(1).every((s) => !s.done && s.at === null));
  });

  it("pending_payment: ни один шаг не выполнен", () => {
    const v = buildOrderView(input({ order: order({ status: "pending_payment", paid_at: null, shipped_at: null, tracking_number: null }), history: HISTORY.slice(0, 1) }));
    assert.ok(v.timeline.every((s) => !s.done && s.at === null));
  });

  it("cancelled: шагов не было — все недостигнутые; cancel_reason отдаётся", () => {
    const v = buildOrderView(input({
      order: order({ status: "cancelled", paid_at: null, shipped_at: null, tracking_number: null, cancel_reason: "Не оплачен за 30 минут" }),
      history: [HISTORY[0], { to_status: "cancelled", created_at: "2026-10-01T13:00:05Z" }],
    }));
    assert.equal(v.status_label, "Отменён");
    assert.ok(v.timeline.every((s) => !s.done));
    assert.equal(v.cancel_reason, "Не оплачен за 30 минут");
    assert.equal(v.can_pay, false);
    assert.equal(v.reserved_until, null);
  });

  it("refunded после confirmed: выполнены только paid и confirmed; сумма возвратов", () => {
    const v = buildOrderView(input({
      order: order({ status: "refunded", shipped_at: null, tracking_number: null, cancel_reason: "старое" }),
      history: [...HISTORY.slice(0, 3), { to_status: "refunded", created_at: "2026-10-03T10:00:00Z" }],
      refunded_amount: 13370000,
    }));
    assert.equal(v.status_label, "Деньги возвращены");
    assert.deepEqual(v.timeline.map((s) => s.done), [true, true, false, false]);
    assert.equal(v.refunded_amount_formatted, rub(13370000));
    assert.equal(v.cancel_reason, null);
    assert.equal(v.expected_delivery, null);
  });

  it("частичный возврат: статус прежний, сумма возвращённого есть", () => {
    const v = buildOrderView(input({ refunded_amount: 3340000 }));
    assert.equal(v.status, "shipped");
    assert.equal(v.refunded_amount_formatted, rub(3340000));
  });

  it("delivered: все шаги выполнены, expected_delivery null", () => {
    const v = buildOrderView(input({
      order: order({ status: "delivered", delivered_at: "2026-10-06T08:00:00Z" }),
      history: [...HISTORY, { to_status: "delivered", created_at: "2026-10-06T08:00:00Z" }],
    }));
    assert.ok(v.timeline.every((s) => s.done));
    assert.equal(v.timeline[3].at, "2026-10-06T08:00:00.000Z");
    assert.equal(v.expected_delivery, null);
  });
});

describe("доставка: трек, курьер, ожидаемая дата", () => {
  it("курьер по Москве: без трек-ссылки, courier_note, 1–2 рабочих дня", () => {
    const v = buildOrderView(input({
      order: order({
        delivery_method: "moscow_courier", delivery_city: "Москва", delivery_address: "ул. Тверская, д. 1, кв. 2",
        cdek_pvz_code: null, tracking_number: "1234567890", courier_note: "Курьер Сергей, +7 999 000-11-22, 14:00–18:00",
      }),
    }));
    assert.equal(v.tracking, null);
    assert.equal(v.courier_note, "Курьер Сергей, +7 999 000-11-22, 14:00–18:00");
    assert.deepEqual(v.delivery, {
      method: "moscow_courier", method_label: "Курьер по Москве", city: "Москва", cdek_pvz_code: null, address: "ул. Тверская, д. 1, кв. 2",
    });
    // Пт 02.10 → Пн 05.10 … Вт 06.10.
    assert.deepEqual(v.expected_delivery, { from: "2026-10-05", to: "2026-10-06" });
  });

  it("СДЭК до двери: трек есть → ссылка; courier_note не отдаётся", () => {
    const v = buildOrderView(input({
      order: order({ delivery_method: "cdek_door", cdek_pvz_code: null, delivery_address: "Казань, ул. Баумана, 1", courier_note: "x" }),
    }));
    assert.equal(v.delivery.method_label, "СДЭК — до двери");
    assert.deepEqual(v.tracking, { number: "1234567890", url: "https://www.cdek.ru/ru/tracking?order_id=1234567890" });
    assert.equal(v.courier_note, null);
  });

  it("СДЭК без трека → tracking null", () => {
    assert.equal(buildOrderView(input({ order: order({ tracking_number: null }) })).tracking, null);
  });

  it("дата отгрузки — по Москве: 21:30 UTC пятницы = суббота МСК → от понедельника", () => {
    const v = buildOrderView(input({ order: order({ shipped_at: "2026-10-02T21:30:00Z" }) }));
    // Сб 03.10 (МСК) + 2 рабочих = Вт 06.10; + 5 = Пт 09.10.
    assert.deepEqual(v.expected_delivery, { from: "2026-10-06", to: "2026-10-09" });
  });

  it("отгрузка в среду, срок через выходные", () => {
    const v = buildOrderView(input({ order: order({ shipped_at: "2026-10-07T09:00:00Z" }) }));
    assert.deepEqual(v.expected_delivery, { from: "2026-10-09", to: "2026-10-14" });
  });

  it("addBusinessDays и moscowDate", () => {
    assert.equal(addBusinessDays("2026-10-02", 1), "2026-10-05");
    assert.equal(addBusinessDays("2026-10-03", 1), "2026-10-05");
    assert.equal(addBusinessDays("2026-10-04", 1), "2026-10-05");
    assert.equal(addBusinessDays("2026-12-31", 1), "2027-01-01");
    assert.equal(moscowDate(new Date("2026-12-31T21:10:00Z")), "2027-01-01");
    assert.equal(moscowDate(new Date("2026-10-02T20:59:59Z")), "2026-10-02");
  });
});

describe("оплата: reserved_until и can_pay на границе брони", () => {
  const pending = (reserved: string | null) => order({
    status: "pending_payment", reserved_until: reserved, paid_at: null, shipped_at: null, tracking_number: null,
  });

  it("бронь действует → can_pay, reserved_until в ISO", () => {
    const v = buildOrderView(input({ order: pending("2026-10-02T12:00:00.001+00:00") }));
    assert.equal(v.can_pay, true);
    assert.equal(v.reserved_until, "2026-10-02T12:00:00.001Z");
    assert.equal(v.status_label, "Ожидает оплаты");
  });

  it("reserved_until = now → can_pay false (строго больше)", () => {
    assert.equal(buildOrderView(input({ order: pending("2026-10-02T12:00:00+00:00") })).can_pay, false);
  });

  it("бронь истекла → can_pay false, reserved_until ещё отдаётся (статус pending_payment)", () => {
    const v = buildOrderView(input({ order: pending("2026-10-02T11:59:59+00:00") }));
    assert.equal(v.can_pay, false);
    assert.equal(v.reserved_until, "2026-10-02T11:59:59.000Z");
  });

  it("без брони → can_pay false", () => {
    assert.equal(buildOrderView(input({ order: pending(null) })).can_pay, false);
  });

  it("не pending_payment — reserved_until null, даже если в БД есть", () => {
    const v = buildOrderView(input({ order: order({ status: "paid", reserved_until: "2026-10-02T13:00:00Z" }) }));
    assert.equal(v.reserved_until, null);
    assert.equal(v.can_pay, false);
  });
});

describe("маски контактов и Telegram", () => {
  it("email", () => {
    assert.equal(maskEmail("artem.sokolov@yandex.ru"), "ar***@yandex.ru");
    assert.equal(maskEmail("abcd@mail.ru"), "ab***@mail.ru");
    assert.equal(maskEmail("abc@mail.ru"), "a***@mail.ru");
    assert.equal(maskEmail("a@mail.ru"), "a***@mail.ru");
    assert.equal(maskEmail("broken"), "***");
  });

  it("телефон", () => {
    assert.equal(maskPhone("+79165551234"), "+7 916 ***-**-34");
    assert.equal(maskPhone("89165551234"), "***");
  });

  it("telegram_subscribed = false, ссылка при доступе по токену остаётся", () => {
    const v = buildOrderView(input({ order: order({ telegram_subscribed: false }) }));
    assert.equal(v.telegram_subscribed, false);
    assert.equal(v.telegram_link, `https://t.me/forgecarbon_bot?start=o_${TOKEN}`);
  });

  it("customer_visible_note и удалённый товар (product_slug null)", () => {
    const v = buildOrderView(input({
      order: order({ customer_visible_note: "Задержка на таможне" }),
      items: [{ title: "Диффузор", quantity: 2, unit_price: 5000000, line_total: 10000000, product_slug: null }],
    }));
    assert.equal(v.customer_visible_note, "Задержка на таможне");
    assert.deepEqual(v.items, [{
      title: "Диффузор", quantity: 2, unit_price_formatted: rub(5000000), line_total_formatted: rub(10000000), product_slug: null,
    }]);
  });
});
