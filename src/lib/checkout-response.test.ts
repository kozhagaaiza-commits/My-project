import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FORBIDDEN_MESSAGE, NETWORK_MESSAGE, orderNumberFromUrl, parseCreateOrderResponse, resolveCreateOrderResult,
  safeNavigationUrl, splitFieldErrors, type CreateOrderResult,
} from "@/lib/checkout-response";

const PID = "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51";
const ORDER_URL = "https://forgecarbon.vercel.app/orders/FC-26-000123?t=Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU";
const CREATED = {
  order_id: "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68", order_number: "FC-26-000123", total: 13370000,
  total_formatted: "133 700 ₽", reserved_until: "2026-10-01T13:00:00.000Z",
  confirmation_url: "https://yoomoney.ru/checkout/payments/v2/contract?orderId=30a8d2c1", order_url: ORDER_URL,
};
const err = (code: string, message: string, details?: unknown) => ({ error: { code, message, ...(details ? { details } : {}) } });
const outcome = (status: number, body: unknown) => resolveCreateOrderResult(parseCreateOrderResponse(status, body));

describe("parseCreateOrderResponse", () => {
  it("201 { data } → ok", () => {
    assert.deepEqual(parseCreateOrderResponse(201, { data: CREATED }), { ok: true, data: CREATED });
  });
  it("{ error } → api с code/message/details", () => {
    const body = err("RATE_LIMITED", "Слишком много попыток оформления. Повторите через 10 минут", { retry_after_seconds: 600 });
    assert.deepEqual(parseCreateOrderResponse(429, body), {
      ok: false, kind: "api", status: 429, code: "RATE_LIMITED",
      message: "Слишком много попыток оформления. Повторите через 10 минут", details: { retry_after_seconds: 600 },
    });
  });
  it("неизвестная форма, 5xx без error, неполный data → network", () => {
    assert.deepEqual(parseCreateOrderResponse(502, "<html>"), { ok: false, kind: "network" });
    assert.deepEqual(parseCreateOrderResponse(500, {}), { ok: false, kind: "network" });
    assert.deepEqual(parseCreateOrderResponse(201, { data: { order_number: "FC-26-000123" } }), { ok: false, kind: "network" });
    assert.deepEqual(parseCreateOrderResponse(200, null), { ok: false, kind: "network" });
  });
});

describe("resolveCreateOrderResult: все коды Блока 3", () => {
  it("201 → success с confirmation_url", () => {
    assert.deepEqual(outcome(201, { data: CREATED }), {
      type: "success", confirmationUrl: CREATED.confirmation_url, orderNumber: "FC-26-000123",
    });
  });
  it("201 с негодным confirmation_url → страница заказа; с обоими негодными → toast", () => {
    assert.deepEqual(outcome(201, { data: { ...CREATED, confirmation_url: "javascript:alert(1)" } }), {
      type: "payment_provider_error", orderUrl: ORDER_URL, orderNumber: "FC-26-000123",
    });
    assert.equal(outcome(201, { data: { ...CREATED, confirmation_url: "x", order_url: "y" } }).type, "toast");
  });
  it("400 VALIDATION_ERROR → ошибки по полям (ключи вида customer.phone, consent_pd)", () => {
    const body = err("VALIDATION_ERROR", "Проверьте поля формы", {
      fields: { "customer.phone": ["Телефон в формате +7 999 123-45-67"], "delivery.cdek_pvz_code": ["Код ПВЗ из 3–20 латинских букв и цифр"], consent_pd: ["Нужно согласие на обработку персональных данных"] },
    });
    assert.deepEqual(outcome(400, body), {
      type: "field_errors", fallbackMessage: null,
      errors: [
        { name: "customer.phone", message: "Телефон в формате +7 999 123-45-67" },
        { name: "delivery.cdek_pvz_code", message: "Код ПВЗ из 3–20 латинских букв и цифр" },
        { name: "consent_pd", message: "Нужно согласие на обработку персональных данных" },
      ],
    });
  });
  it("400 без полей или с полями вне формы → fallbackMessage для toast", () => {
    assert.deepEqual(outcome(400, err("VALIDATION_ERROR", "Проверьте поля формы")), { type: "field_errors", errors: [], fallbackMessage: "Проверьте поля формы" });
    assert.deepEqual(splitFieldErrors({ fields: { items: ["Один товар — одна позиция"], vin: ["VIN — 17 символов без I, O, Q"] } }, "m"), {
      errors: [{ name: "vin", message: "VIN — 17 символов без I, O, Q" }], fallbackMessage: "Один товар — одна позиция",
    });
    assert.deepEqual(splitFieldErrors({ fields: { items: ["Корзина пуста"] } }, "Проверьте поля формы"), {
      errors: [], fallbackMessage: "Проверьте поля формы",
    });
  });
  it("403 → toast «Не удалось отправить заказ. Обновите страницу»", () => {
    assert.deepEqual(outcome(403, err("FORBIDDEN", "Forbidden")), { type: "toast", message: FORBIDDEN_MESSAGE });
    assert.equal(FORBIDDEN_MESSAGE, "Не удалось отправить заказ. Обновите страницу");
  });
  it("409 PRICE_CHANGED → диалог с ценами", () => {
    const details = { expected_total: 13370000, actual_total: 13520000, actual_total_formatted: "135 200 ₽" };
    assert.deepEqual(outcome(409, err("PRICE_CHANGED", "Цены изменились", details)), {
      type: "price_changed", expectedTotal: 13370000, actualTotal: 13520000, actualFormatted: "135 200 ₽",
    });
    assert.deepEqual(outcome(409, err("PRICE_CHANGED", "Цены изменились")), { type: "toast", message: "Цены изменились" });
  });
  it("409 OUT_OF_STOCK, 410 PRODUCT_UNAVAILABLE, 409 MIXED_KINDS и QTY_LIMIT → toast + /cart", () => {
    assert.deepEqual(outcome(409, err("OUT_OF_STOCK", "Комплект закончился", { product_id: PID, available_qty: 0 })), { type: "cart_problem", message: "Комплект закончился" });
    assert.deepEqual(outcome(410, err("PRODUCT_UNAVAILABLE", "Товар больше не продаётся", { product_id: PID })), { type: "cart_problem", message: "Товар больше не продаётся" });
    assert.deepEqual(outcome(409, err("MIXED_KINDS", "Товары под заказ оформляются отдельным заказом")), { type: "cart_problem", message: "Товары под заказ оформляются отдельным заказом" });
    assert.deepEqual(outcome(409, err("QTY_LIMIT", "Не больше 2 комплектов одного диска в заказе", { product_id: PID })), { type: "cart_problem", message: "Не больше 2 комплектов одного диска в заказе" });
  });
  it("429 RATE_LIMITED (в т.ч. BR-18) → toast с текстом ответа", () => {
    const m = "У вас уже есть неоплаченные заказы. Оплатите или дождитесь отмены через 30 минут";
    assert.deepEqual(outcome(429, err("RATE_LIMITED", m)), { type: "toast", message: m });
  });
  it("502 PAYMENT_PROVIDER_ERROR → диалог с order_url и номером заказа из ссылки", () => {
    const body = err("PAYMENT_PROVIDER_ERROR", "Платёжный сервис временно недоступен. Заказ сохранён — оплатите его со страницы заказа", { order_url: ORDER_URL });
    assert.deepEqual(outcome(502, body), { type: "payment_provider_error", orderUrl: ORDER_URL, orderNumber: "FC-26-000123" });
    assert.equal(outcome(502, err("PAYMENT_PROVIDER_ERROR", "Сбой")).type, "toast");
  });
  it("прочее (500, неизвестный код) → toast с сообщением сервера", () => {
    assert.deepEqual(outcome(500, err("INTERNAL_ERROR", "Внутренняя ошибка")), { type: "toast", message: "Внутренняя ошибка" });
  });
  it("сеть → toast «Нет соединения. Данные формы сохранены»", () => {
    const network: CreateOrderResult = { ok: false, kind: "network" };
    assert.deepEqual(resolveCreateOrderResult(network), { type: "network", message: NETWORK_MESSAGE });
    assert.equal(NETWORK_MESSAGE, "Нет соединения. Данные формы сохранены");
  });
});

describe("safeNavigationUrl / orderNumberFromUrl", () => {
  it("пропускает только http(s)", () => {
    assert.equal(safeNavigationUrl("https://yoomoney.ru/x?a=1"), "https://yoomoney.ru/x?a=1");
    assert.equal(safeNavigationUrl("javascript:alert(1)"), null);
    assert.equal(safeNavigationUrl("data:text/html,x"), null);
    assert.equal(safeNavigationUrl("не ссылка"), null);
    assert.equal(safeNavigationUrl(undefined), null);
  });
  it("номер заказа из ссылки", () => {
    assert.equal(orderNumberFromUrl(ORDER_URL), "FC-26-000123");
    assert.equal(orderNumberFromUrl("https://x.ru/orders/FC-26-000123"), "FC-26-000123");
    assert.equal(orderNumberFromUrl("https://x.ru/cart"), null);
  });
});
