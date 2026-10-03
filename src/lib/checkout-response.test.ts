import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FORBIDDEN_MESSAGE, NETWORK_MESSAGE, ORDER_EXPIRED_MESSAGE, SERVICE_UNAVAILABLE_MESSAGE, orderNumberFromUrl,
  parseCreateOrderResponse, resolveCreateOrderResult, safeNavigationUrl, splitFieldErrors,
  type CreateOrderResult, type NavigationEnv,
} from "@/lib/checkout-response";

const PID = "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51";
const ORDER_URL = "https://forgecarbon.vercel.app/orders/FC-26-000123?t=Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU";
const CREATED = {
  order_id: "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68", order_number: "FC-26-000123", total: 13370000,
  total_formatted: "133 700 ₽", reserved_until: "2026-10-01T13:00:00.000Z",
  confirmation_url: "https://yoomoney.ru/checkout/payments/v2/contract?orderId=30a8d2c1", order_url: ORDER_URL,
};
const err = (code: string, message: string, details?: unknown) => ({ error: { code, message, ...(details ? { details } : {}) } });
const DEV: NavigationEnv = { production: false, origin: "https://forgecarbon.vercel.app" };
const PROD: NavigationEnv = { production: true, origin: "https://forgecarbon.vercel.app" };
const outcome = (status: number, body: unknown, env: NavigationEnv = DEV) =>
  resolveCreateOrderResult(parseCreateOrderResponse(status, body), env);

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
  it("неизвестная форма 2xx/4xx, неполный data → network", () => {
    assert.deepEqual(parseCreateOrderResponse(201, { data: { order_number: "FC-26-000123" } }), { ok: false, kind: "network" });
    assert.deepEqual(parseCreateOrderResponse(200, null), { ok: false, kind: "network" });
    assert.deepEqual(parseCreateOrderResponse(404, "<html>"), { ok: false, kind: "network" });
  });
  it("5xx без { error } (HTML шлюза, пустое тело) → api SERVER_ERROR, а не network", () => {
    const expected = { ok: false, kind: "api", status: 502, code: "SERVER_ERROR", message: "", details: undefined };
    assert.deepEqual(parseCreateOrderResponse(502, null), expected);
    assert.deepEqual(parseCreateOrderResponse(500, {}), { ...expected, status: 500 });
  });
});

describe("resolveCreateOrderResult: все коды Блока 3", () => {
  it("201 → success с confirmation_url", () => {
    assert.deepEqual(outcome(201, { data: CREATED }), {
      type: "success", confirmationUrl: CREATED.confirmation_url, orderNumber: "FC-26-000123",
    });
  });
  it("201: confirmation_url без allowlist хостов (любой https), в production http отбрасывается", () => {
    assert.equal(outcome(201, { data: { ...CREATED, confirmation_url: "https://pay.new-domain.example/x" } }, PROD).type, "success");
    assert.deepEqual(outcome(201, { data: { ...CREATED, confirmation_url: "http://yoomoney.ru/c" } }, PROD), {
      type: "payment_provider_error", orderUrl: ORDER_URL, orderNumber: "FC-26-000123",
    });
  });
  it("201 с негодным confirmation_url → страница заказа; с обоими негодными (или order_url чужого сайта) → toast", () => {
    assert.equal(outcome(201, { data: { ...CREATED, confirmation_url: "javascript:alert(1)", order_url: "https://evil.example/orders/FC-26-000123" } }).type, "toast");
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
  it("502 с order_url чужого origin → только текст диалога, без перехода", () => {
    const foreign = "https://evil.example/orders/FC-26-000123?t=abc";
    const body = err("PAYMENT_PROVIDER_ERROR", "Сбой", { order_url: foreign });
    assert.deepEqual(outcome(502, body), { type: "payment_provider_error", orderUrl: null, orderNumber: "FC-26-000123" });
  });
  it("неизвестный код 4xx → toast с сообщением сервера", () => {
    assert.deepEqual(outcome(418, err("TEAPOT", "Чайник")), { type: "toast", message: "Чайник" });
  });
  it("500 INTERNAL_ERROR и любой 5xx → toast «Сервис временно недоступен…» (Edge Case 6)", () => {
    const expected = { type: "toast", message: SERVICE_UNAVAILABLE_MESSAGE };
    assert.equal(SERVICE_UNAVAILABLE_MESSAGE, "Сервис временно недоступен, попробуйте через несколько минут");
    assert.deepEqual(outcome(500, err("INTERNAL_ERROR", "Внутренняя ошибка")), expected);
    assert.deepEqual(outcome(503, err("SERVICE_UNAVAILABLE", "x")), expected);
    assert.deepEqual(outcome(504, null), expected);
    assert.deepEqual(outcome(500, {}), expected);
    // 502 PAYMENT_PROVIDER_ERROR без валидных details остаётся toast с текстом ответа, не «сервис недоступен»
    assert.deepEqual(outcome(502, err("PAYMENT_PROVIDER_ERROR", "Сбой")), { type: "toast", message: "Сбой" });
  });
  it("409 ORDER_NOT_PAYABLE → новая попытка с toast «Время на оплату истекло. Оформите заказ заново»", () => {
    assert.equal(ORDER_EXPIRED_MESSAGE, "Время на оплату истекло. Оформите заказ заново");
    assert.deepEqual(outcome(409, err("ORDER_NOT_PAYABLE", "Время на оплату истекло. Оформите заказ заново")), { type: "new_attempt", message: ORDER_EXPIRED_MESSAGE });
    assert.deepEqual(outcome(409, err("ORDER_NOT_PAYABLE", "другой текст")), { type: "new_attempt", message: ORDER_EXPIRED_MESSAGE });
  });
  it("409 CONFLICT (повтор с другим email/пользователем) → новая попытка с текстом ответа", () => {
    assert.deepEqual(outcome(409, err("CONFLICT", "Повторите оформление заказа")), { type: "new_attempt", message: "Повторите оформление заказа" });
  });
  it("сеть → toast «Нет соединения. Данные формы сохранены»", () => {
    const network: CreateOrderResult = { ok: false, kind: "network" };
    assert.deepEqual(resolveCreateOrderResult(network), { type: "network", message: NETWORK_MESSAGE });
    assert.equal(NETWORK_MESSAGE, "Нет соединения. Данные формы сохранены");
  });
});

describe("safeNavigationUrl / orderNumberFromUrl", () => {
  it("dev/тесты: http(s) разрешены, javascript:/data:/мусор — нет", () => {
    assert.equal(safeNavigationUrl("https://yoomoney.ru/x?a=1", { env: DEV }), "https://yoomoney.ru/x?a=1");
    assert.equal(safeNavigationUrl("http://localhost:3000/pay", { env: DEV }), "http://localhost:3000/pay");
    assert.equal(safeNavigationUrl("javascript:alert(1)", { env: DEV }), null);
    assert.equal(safeNavigationUrl("data:text/html,x", { env: DEV }), null);
    assert.equal(safeNavigationUrl("не ссылка", { env: DEV }), null);
    assert.equal(safeNavigationUrl(undefined, { env: DEV }), null);
  });
  it("production: только https:; ссылки с логином/паролем отбрасываются", () => {
    assert.equal(safeNavigationUrl("https://yoomoney.ru/x?a=1", { env: PROD }), "https://yoomoney.ru/x?a=1");
    assert.equal(safeNavigationUrl("http://yoomoney.ru/x", { env: PROD }), null);
    assert.equal(safeNavigationUrl("javascript:alert(1)", { env: PROD }), null);
    assert.equal(safeNavigationUrl("https://user:pass@yoomoney.ru/x", { env: PROD }), null);
  });
  it("sameOrigin: origin должен совпасть с текущим сайтом; origin неизвестен → отказ", () => {
    assert.equal(safeNavigationUrl(ORDER_URL, { env: PROD, sameOrigin: true }), ORDER_URL);
    assert.equal(safeNavigationUrl("https://forgecarbon.vercel.app.evil.example/orders/x", { env: PROD, sameOrigin: true }), null);
    assert.equal(safeNavigationUrl("http://forgecarbon.vercel.app/orders/x", { env: DEV, sameOrigin: true }), null);
    assert.equal(safeNavigationUrl(ORDER_URL, { env: { production: false, origin: null }, sameOrigin: true }), null);
  });
  it("по умолчанию env из NODE_ENV (в тестах не production)", () => {
    assert.equal(safeNavigationUrl("http://localhost:3000/x"), "http://localhost:3000/x");
  });
  it("номер заказа из ссылки", () => {
    assert.equal(orderNumberFromUrl(ORDER_URL), "FC-26-000123");
    assert.equal(orderNumberFromUrl("https://x.ru/orders/FC-26-000123"), "FC-26-000123");
    assert.equal(orderNumberFromUrl("https://x.ru/cart"), null);
  });
});
