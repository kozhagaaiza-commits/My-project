import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { FAKE_SECRET_KEY, FAKE_SHOP_ID, FakeYookassa, type FakeRequest } from "@/lib/payments/__fixtures__/fake-yookassa";
import {
  YOOKASSA_API_URL, YOOKASSA_VAT_CODE, YookassaApiError, YookassaResponseError, YookassaUnavailableError,
  createYookassaClient, resolveYookassaBaseUrl, type CreatePaymentParams,
} from "@/lib/yookassa";

const ORDER_ID = "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68";
const LONG_TITLE = "Карбоновый диффузор заднего бампера ".repeat(6); // > 128 символов
const PARAMS: CreatePaymentParams = {
  orderId: ORDER_ID, orderNumber: "FC-26-000123", amount: 13370000 + 4500050,
  email: "artem.sokolov@yandex.ru", phone: "+79165551234",
  items: [
    { title: "Кованый моноблок M-01 R20, 5×112, графит", quantity: 1, unit_price: 13370000 },
    { title: LONG_TITLE, quantity: 2, unit_price: 2250025 },
  ],
  returnUrl: "https://forgecarbon.vercel.app/orders/FC-26-000123?t=Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU&from=payment",
  attempt: 2,
};

let fake: FakeYookassa;
const sleeps: number[] = [];
const client = (over: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}) =>
  createYookassaClient({ baseUrl: fake.url, shopId: FAKE_SHOP_ID, secretKey: FAKE_SECRET_KEY, sleep: async (ms) => { sleeps.push(ms); }, ...over });
const isCreate = (r: FakeRequest) => r.method === "POST" && r.path === "/v3/payments";

before(async () => { fake = await new FakeYookassa().start(); });
after(async () => { await fake.stop(); });
afterEach(() => { fake.clearInterceptors(); fake.requests.length = 0; sleeps.length = 0; });

describe("yookassa: createPayment (5.9.1)", () => {
  it("Basic-аутентификация, Idempotence-Key order_<id>_<attempt>, тело платежа и чек 54-ФЗ", async () => {
    const p = await client().createPayment(PARAMS);
    assert.equal(p.status, "pending");
    assert.match(p.confirmation?.confirmation_url ?? "", /^https:\/\/yoomoney\.ru\/checkout/);
    assert.equal(fake.requests.length, 1);
    const r = fake.requests[0];
    assert.equal(r.headers.authorization, "Basic " + Buffer.from(`${FAKE_SHOP_ID}:${FAKE_SECRET_KEY}`).toString("base64"));
    assert.equal(r.headers["idempotence-key"], `order_${ORDER_ID}_2`);
    assert.equal(r.headers["content-type"], "application/json");
    assert.deepEqual(r.body, {
      amount: { value: "178700.50", currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: PARAMS.returnUrl },
      description: "Заказ FC-26-000123",
      metadata: { order_id: ORDER_ID, order_number: "FC-26-000123" },
      receipt: {
        customer: { email: "artem.sokolov@yandex.ru", phone: "79165551234" },
        items: [
          { description: "Кованый моноблок M-01 R20, 5×112, графит", quantity: 1, amount: { value: "133700.00", currency: "RUB" }, vat_code: 1, payment_mode: "full_prepayment", payment_subject: "commodity" },
          { description: LONG_TITLE.slice(0, 128), quantity: 2, amount: { value: "22500.25", currency: "RUB" }, vat_code: 1, payment_mode: "full_prepayment", payment_subject: "commodity" },
        ],
      },
    });
    assert.equal(YOOKASSA_VAT_CODE, 1);
    assert.ok(!("payment_method_data" in (r.body as object)), "способы оплаты не передаются");
  });

  it("5xx → до 3 попыток с паузами 1 и 3 с и ТЕМ ЖЕ Idempotence-Key", async () => {
    fake.interceptTimes(2, isCreate, { status: 500, json: { type: "error", code: "internal_server_error" } });
    const p = await client().createPayment(PARAMS);
    assert.equal(p.status, "pending");
    assert.equal(fake.requests.length, 3);
    assert.deepEqual(new Set(fake.requests.map((r) => r.headers["idempotence-key"])), new Set([`order_${ORDER_ID}_2`]));
    assert.deepEqual(sleeps, [1000, 3000]);
  });

  it("3 × 5xx → YookassaUnavailableError, ровно 3 запроса", async () => {
    fake.intercept((r) => (isCreate(r) ? { status: 503, text: "<html>busy</html>" } : undefined));
    await assert.rejects(client().createPayment(PARAMS), YookassaUnavailableError);
    assert.equal(fake.requests.length, 3);
  });

  it("202 (в обработке) повторяется как 5xx", async () => {
    fake.interceptTimes(1, isCreate, { status: 202, json: { type: "processing", retry_after: 1800 } });
    assert.equal((await client().createPayment(PARAMS)).status, "pending");
    assert.equal(fake.requests.length, 2);
  });

  it("4xx → YookassaApiError с code/description, без повтора", async () => {
    fake.intercept((r) => (isCreate(r) ? { status: 400, json: { type: "error", id: "e1", code: "invalid_request", description: "Invalid receipt: vat_code", parameter: "receipt" } } : undefined));
    const err = await client().createPayment(PARAMS).then(() => null, (e: unknown) => e);
    assert.ok(err instanceof YookassaApiError);
    assert.equal(err.status, 400);
    assert.equal(err.code, "invalid_request");
    assert.equal(err.message, "Invalid receipt: vat_code");
    assert.equal(fake.requests.length, 1);
    assert.deepEqual(sleeps, []);
  });

  it("4xx с телом не-JSON тоже не повторяется", async () => {
    fake.intercept(() => ({ status: 401, text: "Unauthorized" }));
    await assert.rejects(client().getPayment("30a8d2c1-000f-5000-9000-1b6c4d2e8f10"), (e: unknown) => e instanceof YookassaApiError && e.message === "HTTP 401");
    assert.equal(fake.requests.length, 1);
  });

  it("таймаут каждой попытки → 3 попытки → YookassaUnavailableError", async () => {
    fake.intercept(() => "hang");
    await assert.rejects(client({ timeoutMs: 50 }).createPayment(PARAMS), YookassaUnavailableError);
    assert.equal(fake.requests.length, 3);
  });

  it("сетевая ошибка → 3 попытки с тем же ключом", async () => {
    const keys: string[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      keys.push(String(new Headers(init?.headers).get("Idempotence-Key")));
      throw new TypeError("fetch failed");
    };
    await assert.rejects(client({ fetchImpl }).createPayment(PARAMS), YookassaUnavailableError);
    assert.deepEqual(keys, Array(3).fill(`order_${ORDER_ID}_2`));
  });

  it("2xx с битым JSON повторяется; 2xx не той формы → YookassaResponseError без повтора", async () => {
    fake.interceptTimes(1, isCreate, { status: 200, text: "{oops" });
    assert.equal((await client().createPayment(PARAMS)).status, "pending");
    assert.equal(fake.requests.length, 2);

    fake.clearInterceptors(); fake.requests.length = 0;
    fake.intercept(() => ({ status: 200, json: { id: "x", status: "paid_maybe" } }));
    await assert.rejects(client().getPayment("30a8d2c1-000f-5000-9000-1b6c4d2e8f10"), YookassaResponseError);
    assert.equal(fake.requests.length, 1);
  });

  it("ошибки не содержат секретный ключ и заголовок Authorization", async () => {
    fake.intercept(() => ({ status: 500 }));
    const err = await client().getPayment("30a8d2c1-000f-5000-9000-1b6c4d2e8f10").then(() => null, (e: unknown) => e);
    assert.ok(err instanceof Error);
    const dump = `${err.message} ${String((err as Error & { cause?: unknown }).cause)} ${JSON.stringify(err)}`;
    assert.doesNotMatch(dump, new RegExp(FAKE_SECRET_KEY));
    assert.doesNotMatch(dump, /Basic /);
  });
});

describe("yookassa: 429 / 409 / retry_after", () => {
  it("429 и 409 на POST повторяются с ТЕМ ЖЕ ключом; retry_after (мс) удлиняет паузу", async () => {
    fake.interceptTimes(1, isCreate, { status: 429, json: { type: "error", code: "too_many_requests", retry_after: 2500 } });
    fake.interceptTimes(1, isCreate, { status: 409, json: { type: "error", code: "invalid_request", description: "Idempotence key is being processed" } });
    assert.equal((await client().createPayment(PARAMS)).status, "pending");
    assert.equal(fake.requests.length, 3);
    assert.deepEqual(new Set(fake.requests.map((r) => r.headers["idempotence-key"])), new Set([`order_${ORDER_ID}_2`]));
    assert.deepEqual(sleeps, [2500, 3000]);
  });

  it("retry_after ограничен 10 с; 409 на GET не повторяется (это 4xx)", async () => {
    fake.interceptTimes(1, isCreate, { status: 429, json: { type: "error", retry_after: 600000 } });
    await client().createPayment(PARAMS);
    assert.deepEqual(sleeps, [10000]);
    fake.clearInterceptors(); fake.requests.length = 0;
    fake.intercept(() => ({ status: 409, json: { type: "error", code: "conflict" } }));
    await assert.rejects(client().getPayment("30a8d2c1-000f-5000-9000-1b6c4d2e8f10"), YookassaApiError);
    assert.equal(fake.requests.length, 1);
  });

  it("3 × 429 → YookassaUnavailableError (не «отклонено»)", async () => {
    fake.intercept(() => ({ status: 429, json: { type: "error", code: "too_many_requests" } }));
    await assert.rejects(client().createPayment(PARAMS), YookassaUnavailableError);
    assert.equal(fake.requests.length, 3);
  });
});

describe("yookassa: общий дедлайн вызова (deadlineMs)", () => {
  /** Мгновенные паузы, двигающие управляемые часы. */
  function clocked(over: { timeoutMs?: number } = {}) {
    let t = 0;
    const log: number[] = [];
    const c = createYookassaClient({
      baseUrl: fake.url, shopId: FAKE_SHOP_ID, secretKey: FAKE_SECRET_KEY, clock: () => t,
      sleep: async (ms) => { log.push(ms); t += ms; }, ...over,
    });
    return { c, log, tick: (ms: number) => { t += ms; } };
  }

  it("новая попытка, не укладывающаяся в бюджет, не начинается → YookassaUnavailableError", async () => {
    fake.intercept((r) => (isCreate(r) ? { status: 500 } : undefined));
    const { c, log } = clocked();
    await assert.rejects(c.createPayment(PARAMS, { deadlineMs: 2000 }), YookassaUnavailableError);
    assert.equal(fake.requests.length, 2, "0 с и 1 с; пауза 3 с вышла бы за 2 с");
    assert.deepEqual(log, [1000]);
  });

  it("без дедлайна — все 3 попытки; дедлайн 0 — ни одного запроса", async () => {
    fake.intercept(() => ({ status: 500 }));
    await assert.rejects(clocked().c.createPayment(PARAMS), YookassaUnavailableError);
    assert.equal(fake.requests.length, 3);
    fake.requests.length = 0;
    await assert.rejects(clocked().c.createPayment(PARAMS, { deadlineMs: 0 }), YookassaUnavailableError);
    assert.equal(fake.requests.length, 0);
  });

  it("время ответа расходует бюджет: медленная первая попытка не оставляет места для второй", async () => {
    const { c, tick } = clocked();
    fake.intercept((r) => { if (isCreate(r)) { tick(24_500); return { status: 503 }; } return undefined; });
    await assert.rejects(c.createPayment(PARAMS, { deadlineMs: 25_000 }), YookassaUnavailableError);
    assert.equal(fake.requests.length, 1);
  });

  it("таймаут попытки урезается до остатка бюджета (реальное время)", async () => {
    fake.intercept(() => "hang");
    const started = Date.now();
    await assert.rejects(client({ timeoutMs: 10_000 }).createPayment(PARAMS, { deadlineMs: 150 }), YookassaUnavailableError);
    assert.ok(Date.now() - started < 2000, `ожидание ${Date.now() - started} мс`);
    assert.equal(fake.requests.length, 1);
  });
});

describe("yookassa: getPayment / getRefund / createRefund", () => {
  it("getPayment: GET /payments/{id} без Idempotence-Key, ответ проверен Zod", async () => {
    const created = await client().createPayment(PARAMS);
    fake.succeed(created.id, "bank_card");
    fake.requests.length = 0;
    const p = await client().getPayment(created.id);
    assert.equal(p.status, "succeeded");
    assert.equal(p.payment_method?.type, "bank_card");
    assert.equal(p.amount.value, "178700.50");
    assert.equal(fake.requests[0].method, "GET");
    assert.equal(fake.requests[0].path, `/v3/payments/${created.id}`);
    assert.equal(fake.requests[0].headers["idempotence-key"], undefined);
  });

  it("недопустимый id не уходит в сеть", async () => {
    await assert.rejects(client().getPayment("../refunds/x"), TypeError);
    await assert.rejects(client().getRefund(""), TypeError);
    assert.equal(fake.requests.length, 0);
  });

  it("createRefund: Idempotence-Key refund_<refund.id>, сумма строкой рублей, чек", async () => {
    const receipt = { customer: { email: "a@b.ru", phone: "79165551234" }, items: [] };
    const r = await client().createRefund({ refundId: "b2d8f4a1-6c3e-4a9b-8f07-1e5c9d3a7b62", paymentId: "pay-1234567890", amount: 3340000, description: "Возврат по заказу FC-26-000123", receipt });
    assert.equal(r.status, "succeeded");
    const req = fake.requests[0];
    assert.equal(req.headers["idempotence-key"], "refund_b2d8f4a1-6c3e-4a9b-8f07-1e5c9d3a7b62");
    assert.deepEqual(req.body, { payment_id: "pay-1234567890", amount: { value: "33400.00", currency: "RUB" }, description: "Возврат по заказу FC-26-000123", receipt });
    const again = await client().getRefund(r.id);
    assert.equal(again.payment_id, "pay-1234567890");
  });
});

describe("yookassa: базовый URL", () => {
  it("по умолчанию — https://api.yookassa.ru/v3", () => {
    assert.equal(resolveYookassaBaseUrl({}), YOOKASSA_API_URL);
    assert.equal(YOOKASSA_API_URL, "https://api.yookassa.ru/v3");
  });
  it("YOOKASSA_API_URL работает вне production и ИГНОРИРУЕТСЯ в production", () => {
    assert.equal(resolveYookassaBaseUrl({ NODE_ENV: "development", YOOKASSA_API_URL: "http://127.0.0.1:9999/v3/" }), "http://127.0.0.1:9999/v3");
    assert.equal(resolveYookassaBaseUrl({ NODE_ENV: "test", YOOKASSA_API_URL: "http://127.0.0.1:9999/v3" }), "http://127.0.0.1:9999/v3");
    assert.equal(resolveYookassaBaseUrl({ NODE_ENV: "production", YOOKASSA_API_URL: "http://evil.example/v3" }), YOOKASSA_API_URL);
  });
  it("невалидное переопределение в dev — явная ошибка", () => {
    assert.throws(() => resolveYookassaBaseUrl({ NODE_ENV: "development", YOOKASSA_API_URL: "not a url" }));
    assert.throws(() => resolveYookassaBaseUrl({ NODE_ENV: "development", YOOKASSA_API_URL: "file:///etc/passwd" }));
  });

  it("экземпляр по умолчанию ленивый: env читается при первом вызове, в dev идёт на YOOKASSA_API_URL", async () => {
    // Модуль уже импортирован без серверных переменных (импорт не разбирает env). Теперь задаём их.
    const vars: Record<string, string> = {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40), SUPABASE_SERVICE_ROLE_KEY: "s".repeat(40), YOOKASSA_SHOP_ID: FAKE_SHOP_ID,
      YOOKASSA_SECRET_KEY: FAKE_SECRET_KEY, TELEGRAM_BOT_TOKEN: `123456:${"A".repeat(35)}`, TELEGRAM_BOT_USERNAME: "forgecarbon_bot",
      TELEGRAM_WEBHOOK_SECRET: "w".repeat(32), TELEGRAM_ADMIN_CHAT_ID: "-100123", SMTP_HOST: "smtp.yandex.ru", SMTP_PORT: "465",
      SMTP_USER: "orders@forgecarbon.ru", SMTP_PASSWORD: "password1", CRON_SECRET: "c".repeat(32), ORDER_TOKEN_SECRET: "o".repeat(32),
      NODE_ENV: "development", YOOKASSA_API_URL: fake.url,
    };
    const env = process.env as Record<string, string | undefined>;
    for (const [k, v] of Object.entries(vars)) env[k] = v;
    const { getPayment } = await import("@/lib/yookassa");
    const created = await client().createPayment(PARAMS);
    fake.requests.length = 0;
    assert.equal((await getPayment(created.id)).id, created.id);
    assert.equal(fake.requests.length, 1);
  });
});
