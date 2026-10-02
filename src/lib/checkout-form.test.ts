import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOrderInput, checkoutErrorMap, EMPTY_CHECKOUT_VALUES, isCheckoutFieldName, makeCheckoutResolver,
  type CheckoutFormValues, type OrderMeta,
} from "@/lib/checkout-form";
import { createOrderBody } from "@/lib/schemas/orders";

const PRODUCT = "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51";
const VEHICLE = "6f2d8a41-9c3e-4b75-a0d2-3e8f1c7b9d64";
const REQUEST = "0e7c4a19-5b2d-4f8e-9a63-1d0c8b7e2f45";
const meta: OrderMeta = {
  requestId: REQUEST, items: [{ product_id: PRODUCT, quantity: 1 }], expectedTotal: 13370000, vehicleId: VEHICLE,
};

const base: CheckoutFormValues = {
  ...EMPTY_CHECKOUT_VALUES,
  customer: { name: "  Артём Соколов ", phone: "+7 (916) 555-12-34", email: "Artem.Sokolov@Yandex.ru" },
  consent_pd: true,
  consent_offer: true,
};
const withDelivery = (delivery: Partial<CheckoutFormValues["delivery"]>, rest: Partial<CheckoutFormValues> = {}): CheckoutFormValues => ({
  ...base, ...rest, delivery: { ...base.delivery, ...delivery },
});
const resolve = (values: CheckoutFormValues, m: OrderMeta = meta) =>
  makeCheckoutResolver(() => m)(values, undefined, { fields: {}, shouldUseNativeValidation: false, criteriaMode: "firstError" });

describe("buildOrderInput", () => {
  it("курьер: город «Москва», пустой индекс → null, cdek_pvz_code → null, пустые vin/comment → null", () => {
    const input = buildOrderInput(withDelivery({ method: "moscow_courier", city: "Казань", address: "ул. Тверская, 1, кв. 5", cdek_pvz_code: "ABC" }), meta);
    assert.deepEqual(input.delivery, {
      method: "moscow_courier", city: "Москва", address: "ул. Тверская, 1, кв. 5", postal_code: null, cdek_pvz_code: null,
    });
    assert.equal(input.vin, null);
    assert.equal(input.comment, null);
    assert.equal(input.vehicle_id, VEHICLE);
  });
  it("СДЭК ПВЗ: address и postal_code → null", () => {
    const input = buildOrderInput(withDelivery({ method: "cdek_pvz", city: "Казань", cdek_pvz_code: "KZN45", address: "лишнее", postal_code: "123456" }), meta);
    assert.deepEqual(input.delivery, { method: "cdek_pvz", city: "Казань", cdek_pvz_code: "KZN45", address: null, postal_code: null });
  });
  it("СДЭК до двери: cdek_pvz_code → null, индекс как есть", () => {
    const input = buildOrderInput(withDelivery({ method: "cdek_door", city: "Казань", address: "ул. Баумана, 10, кв. 3", postal_code: "420111", cdek_pvz_code: "ZZZ" }), meta);
    assert.deepEqual(input.delivery, {
      method: "cdek_door", city: "Казань", address: "ул. Баумана, 10, кв. 3", postal_code: "420111", cdek_pvz_code: null,
    });
  });
  it("items — только product_id и quantity; expected_total — из meta; price_seen не уходит", () => {
    const input = buildOrderInput(base, { ...meta, items: [{ product_id: PRODUCT, quantity: 2, price_seen: 1 } as never] });
    assert.deepEqual(input.items, [{ product_id: PRODUCT, quantity: 2 }]);
    assert.equal(input.expected_total, 13370000);
    assert.equal("price_seen" in (input.items as object[])[0], false);
  });
  it("пробельные vin/comment → null", () => {
    const input = buildOrderInput({ ...base, vin: "  ", comment: "   " }, meta);
    assert.equal(input.vin, null);
    assert.equal(input.comment, null);
  });
});

describe("makeCheckoutResolver (zodResolver(createOrderBody))", () => {
  it("курьер: тело проходит createOrderBody, телефон → +79165551234, email lower, имя trim", async () => {
    const result = await resolve(withDelivery({ method: "moscow_courier", address: "ул. Тверская, 1, кв. 5" }, { vin: "wbaja11050b123456", comment: " Позвоните " }));
    assert.deepEqual(result.errors, {});
    const body = result.values as ReturnType<typeof createOrderBody.parse>;
    assert.equal(body.customer.phone, "+79165551234");
    assert.equal(body.customer.email, "artem.sokolov@yandex.ru");
    assert.equal(body.customer.name, "Артём Соколов");
    assert.equal(body.vin, "WBAJA11050B123456");
    assert.equal(body.comment, "Позвоните");
    assert.equal(body.client_request_id, REQUEST);
    assert.equal(body.expected_total, 13370000);
    assert.equal(createOrderBody.safeParse(body).success, true);
  });
  it("ПВЗ: код приводится к верхнему регистру; адрес и индекс null", async () => {
    const result = await resolve(withDelivery({ method: "cdek_pvz", city: "Казань", cdek_pvz_code: "kzn45" }));
    assert.deepEqual(result.errors, {});
    const body = result.values as ReturnType<typeof createOrderBody.parse>;
    assert.deepEqual(body.delivery, { method: "cdek_pvz", city: "Казань", cdek_pvz_code: "KZN45", address: null, postal_code: null });
  });
  it("до двери проходит с индексом из 6 цифр", async () => {
    const result = await resolve(withDelivery({ method: "cdek_door", city: "Казань", address: "ул. Баумана, 10, кв. 3", postal_code: "420111" }));
    assert.deepEqual(result.errors, {});
  });
  it("пустая форма: ошибки по полям с текстами 5.1/схемы", async () => {
    const result = await resolve(EMPTY_CHECKOUT_VALUES);
    const e = result.errors as Record<string, Record<string, { message: string }>>;
    assert.equal(e.customer.name.message, "Минимум 2 символа");
    assert.equal(e.customer.phone.message, "Телефон в формате +7 999 123-45-67");
    assert.equal(e.customer.email.message, "Проверьте email");
    assert.equal(e.delivery.method.message, "Выберите способ доставки");
    assert.equal((result.errors as Record<string, { message: string }>).consent_pd.message, "Нужно согласие на обработку персональных данных");
    assert.equal((result.errors as Record<string, { message: string }>).consent_offer.message, "Нужно принять условия оферты");
  });
  it("поля доставки: русские сообщения вместо английских по умолчанию", async () => {
    const door = await resolve(withDelivery({ method: "cdek_door", city: "К", address: "ул", postal_code: "" }));
    const d = (door.errors as { delivery: Record<string, { message: string }> }).delivery;
    assert.equal(d.city.message, "Укажите город");
    assert.equal(d.address.message, "Укажите улицу, дом и квартиру");
    assert.equal(d.postal_code.message, "Индекс — 6 цифр");
    const pvz = await resolve(withDelivery({ method: "cdek_pvz", city: "Казань", cdek_pvz_code: "К!" }));
    assert.equal((pvz.errors as { delivery: Record<string, { message: string }> }).delivery.cdek_pvz_code.message, "Код ПВЗ из 3–20 латинских букв и цифр");
  });
  it("необязательный индекс курьера: пусто — ок, 5 цифр — «Индекс — 6 цифр»", async () => {
    const courier = { method: "moscow_courier" as const, address: "ул. Тверская, 1, кв. 5" };
    assert.deepEqual((await resolve(withDelivery(courier))).errors, {});
    const bad = await resolve(withDelivery({ ...courier, postal_code: "12345" }));
    assert.equal((bad.errors as { delivery: Record<string, { message: string }> }).delivery.postal_code.message, "Индекс — 6 цифр");
  });
  it("VIN, комментарий > 1000, неполный телефон", async () => {
    const result = await resolve(withDelivery({ method: "cdek_pvz", city: "Казань", cdek_pvz_code: "KZN45" }, {
      vin: "WBAJA1105OB123456", comment: "я".repeat(1001), customer: { ...base.customer, phone: "+7 (916) 55" },
    }));
    const e = result.errors as Record<string, { message: string }> & { customer: Record<string, { message: string }> };
    assert.equal(e.vin.message, "VIN — 17 символов без I, O, Q");
    assert.equal(e.comment.message, "Не больше 1000 символов");
    assert.equal(e.customer.phone.message, "Телефон в формате +7 999 123-45-67");
  });
  it("без ответа validate (expected_total отсутствует) отправка невозможна", async () => {
    const result = await resolve(withDelivery({ method: "cdek_pvz", city: "Казань", cdek_pvz_code: "KZN45" }), { ...meta, expectedTotal: null });
    assert.ok("expected_total" in result.errors);
  });
});

describe("checkoutErrorMap / isCheckoutFieldName", () => {
  it("не трогает поля без текста в 5.1", () => {
    assert.equal(checkoutErrorMap({ code: "too_small", path: ["vin"] }), undefined);
    assert.equal(checkoutErrorMap({ code: "too_big", path: ["delivery", "address"] }), "Не больше 300 символов");
  });
  it("известные имена полей формы", () => {
    assert.equal(isCheckoutFieldName("customer.phone"), true);
    assert.equal(isCheckoutFieldName("delivery.cdek_pvz_code"), true);
    assert.equal(isCheckoutFieldName("consent_pd"), true);
    assert.equal(isCheckoutFieldName("items"), false);
    assert.equal(isCheckoutFieldName("expected_total"), false);
  });
});
