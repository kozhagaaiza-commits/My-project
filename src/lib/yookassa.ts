import "server-only";
import { z } from "zod";
import { kopecksToRubString } from "@/lib/money";

// Клиент ЮKassa API v3 (Чертёж 5.9.1). Логика вызова — дословно по Чертежу: Basic-аутентификация,
// до 3 попыток (0 / 1 / 3 с) при сетевой ошибке и 5xx с ТЕМ ЖЕ Idempotence-Key, 4xx не повторяются, таймаут 15 с.
// Отличия от кода Чертежа (решения Дня 4):
//  - `catch (e: any)` → `unknown` с сужением; ошибки типизированы: YookassaApiError (4xx, не повторяется),
//    YookassaUnavailableError (сеть / таймаут / 5xx / 202 после всех попыток), YookassaResponseError (ответ 2xx не той формы);
//  - фабрика createYookassaClient({ baseUrl, shopId, secretKey, fetchImpl?, sleep?, timeoutMs? }) — для тестов на fake-сервере;
//    экземпляр по умолчанию создаётся лениво при первом вызове (env не разбирается при импорте модуля);
//  - базовый URL https://api.yookassa.ru/v3; process.env.YOOKASSA_API_URL переопределяет его ТОЛЬКО при NODE_ENV !== "production";
//  - ответы ЮKassa проверяются Zod (форма ответа не доверенная); 4xx с телом не-JSON тоже не повторяется;
//  - HTTP 202 (запрос ещё обрабатывается ЮKassa) повторяется с тем же ключом, как 5xx.
// Секретный ключ не попадает ни в сообщения ошибок, ни в логи: в ошибках только статус, code и description ЮKassa.

export const YOOKASSA_API_URL = "https://api.yookassa.ru/v3";
// 1 = без НДС (ИП на УСН). При другой системе налогообложения бухгалтер называет код, константа меняется здесь.
export const YOOKASSA_VAT_CODE = 1;

const RETRY_DELAYS_MS = [0, 1000, 3000]; // до 3 попыток при сетевой ошибке и 5xx; ключ идемпотентности тот же
const TIMEOUT_MS = 15000;
const OBJECT_ID = /^[A-Za-z0-9_-]{1,64}$/;

// ---------- Схемы ответов ----------

const rubAmount = z.object({
  value: z.string().regex(/^\d+(\.\d{1,2})?$/, "amount.value — строка рублей"),
  currency: z.string(),
});
const metadata = z.record(z.string(), z.unknown());

export const yookassaPaymentSchema = z.looseObject({
  id: z.string().min(1).max(64),
  status: z.enum(["pending", "waiting_for_capture", "succeeded", "canceled"]),
  paid: z.boolean(),
  amount: rubAmount,
  payment_method: z.looseObject({ type: z.string() }).optional(),
  metadata: metadata.optional(),
  confirmation: z.looseObject({ type: z.string(), confirmation_url: z.string().optional() }).optional(),
  cancellation_details: z.looseObject({ party: z.string().optional(), reason: z.string() }).optional(),
  created_at: z.string(),
  captured_at: z.string().optional(),
  test: z.boolean().optional(),
});
export type YookassaPayment = z.infer<typeof yookassaPaymentSchema>;
export type YookassaPaymentStatus = YookassaPayment["status"];

export const yookassaRefundSchema = z.looseObject({
  id: z.string().min(1).max(64),
  payment_id: z.string().min(1).max(64),
  status: z.enum(["pending", "succeeded", "canceled"]),
  amount: rubAmount,
  description: z.string().optional(),
  cancellation_details: z.looseObject({ party: z.string().optional(), reason: z.string() }).optional(),
  created_at: z.string(),
});
export type YookassaRefund = z.infer<typeof yookassaRefundSchema>;

const errorBody = z.looseObject({
  type: z.string().optional(),
  id: z.string().optional(),
  code: z.string().optional(),
  description: z.string().optional(),
  parameter: z.string().optional(),
});
export type YookassaErrorBody = z.infer<typeof errorBody>;

// ---------- Ошибки ----------

/** 4xx от ЮKassa: запрос отклонён (неверный чек, ключи, параметры). Не повторяется. */
export class YookassaApiError extends Error {
  readonly status: number;
  readonly yookassa: YookassaErrorBody;
  constructor(status: number, body: YookassaErrorBody) {
    super(body.description ?? "YooKassa error");
    this.name = "YookassaApiError";
    this.status = status;
    this.yookassa = body;
  }
  get code(): string | undefined {
    return this.yookassa.code;
  }
}

/** Сеть, таймаут, 5xx или 202 — после всех попыток. Ключ идемпотентности позволяет безопасно повторить позже. */
export class YookassaUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "YookassaUnavailableError";
  }
}

/** 2xx, но тело не JSON нужной формы. */
export class YookassaResponseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "YookassaResponseError";
  }
}

// ---------- Чек 54-ФЗ ----------

export type ReceiptItemInput = { title: string; quantity: number; unit_price: number };

export interface YookassaReceipt {
  customer: { email: string; phone: string };
  items: Array<{
    description: string;
    quantity: number;
    amount: { value: string; currency: "RUB" };
    vat_code: number;
    payment_mode: "full_prepayment";
    payment_subject: "commodity";
  }>;
}

/** Чек (receipt) по Чертежу 5.9.1: телефон без «+», description ≤ 128 символов, суммы — строки рублей. */
export function buildReceipt(p: { email: string; phone: string; items: ReceiptItemInput[] }): YookassaReceipt {
  return {
    customer: { email: p.email, phone: p.phone.replace("+", "") },
    items: p.items.map((i) => ({
      description: i.title.slice(0, 128),
      quantity: i.quantity,
      amount: { value: kopecksToRubString(i.unit_price), currency: "RUB" },
      vat_code: YOOKASSA_VAT_CODE,
      payment_mode: "full_prepayment",
      payment_subject: "commodity",
    })),
  };
}

// ---------- Клиент ----------

export interface CreatePaymentParams {
  orderId: string;
  orderNumber: string;
  amount: number; // копейки
  email: string;
  phone: string;
  items: ReceiptItemInput[];
  returnUrl: string;
  attempt: number;
}

export interface CreateRefundParams {
  refundId: string; // refunds.id → Idempotence-Key `refund_<id>`
  paymentId: string; // id платежа ЮKassa
  amount: number; // копейки
  description: string;
  receipt: YookassaReceipt;
}

export interface YookassaClient {
  createPayment(p: CreatePaymentParams): Promise<YookassaPayment>;
  getPayment(id: string): Promise<YookassaPayment>;
  getRefund(id: string): Promise<YookassaRefund>;
  createRefund(p: CreateRefundParams): Promise<YookassaRefund>;
}

export interface YookassaClientConfig {
  shopId: string;
  secretKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function parseOr<T>(schema: z.ZodType<T>, json: unknown, what: string): T {
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new YookassaResponseError(`YooKassa: неожиданный ответ (${what}): ${issues}`);
  }
  return parsed.data;
}

function assertObjectId(id: string, what: string) {
  if (!OBJECT_ID.test(id)) throw new TypeError(`YooKassa: недопустимый id ${what}`);
}

export function createYookassaClient(cfg: YookassaClientConfig): YookassaClient {
  const api = (cfg.baseUrl ?? YOOKASSA_API_URL).replace(/\/$/, "");
  const auth = "Basic " + Buffer.from(`${cfg.shopId}:${cfg.secretKey}`).toString("base64");
  const doFetch = cfg.fetchImpl ?? fetch;
  const sleep = cfg.sleep ?? realSleep;
  const timeoutMs = cfg.timeoutMs ?? TIMEOUT_MS;

  async function call(method: "GET" | "POST", path: string, idempotenceKey?: string, body?: unknown): Promise<unknown> {
    let lastError: unknown;
    for (const d of RETRY_DELAYS_MS) {
      if (d) await sleep(d);
      try {
        const res = await doFetch(api + path, {
          method,
          headers: {
            Authorization: auth,
            "Content-Type": "application/json",
            ...(idempotenceKey ? { "Idempotence-Key": idempotenceKey } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        });
        if (res.status >= 500 || res.status === 202) {
          await res.body?.cancel().catch(() => {});
          lastError = new Error(`YooKassa ${res.status}`);
          continue;
        }
        if (!res.ok) {
          // 4xx — не повторяем, даже если тело не JSON.
          const text = await res.text().catch(() => "");
          let json: unknown = null;
          try { json = JSON.parse(text); } catch { json = null; }
          const parsed = errorBody.safeParse(json);
          throw new YookassaApiError(res.status, parsed.success ? parsed.data : { description: `HTTP ${res.status}` });
        }
        return await res.json(); // битый JSON в 2xx — повтор (как в Чертеже)
      } catch (e: unknown) {
        if (e instanceof YookassaApiError) throw e; // 4xx — не повторяем
        lastError = e;
      }
    }
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new YookassaUnavailableError(`YooKassa недоступна: ${method} ${path.split("/")[1] ?? ""}: ${reason}`, { cause: lastError });
  }

  return {
    async createPayment(p) {
      const json = await call("POST", "/payments", `order_${p.orderId}_${p.attempt}`, {
        amount: { value: kopecksToRubString(p.amount), currency: "RUB" },
        capture: true,
        confirmation: { type: "redirect", return_url: p.returnUrl },
        description: `Заказ ${p.orderNumber}`,
        metadata: { order_id: p.orderId, order_number: p.orderNumber },
        receipt: buildReceipt({ email: p.email, phone: p.phone, items: p.items }),
      });
      return parseOr(yookassaPaymentSchema, json, "payment");
    },
    async getPayment(id) {
      assertObjectId(id, "платежа");
      return parseOr(yookassaPaymentSchema, await call("GET", `/payments/${id}`), "payment");
    },
    async getRefund(id) {
      assertObjectId(id, "возврата");
      return parseOr(yookassaRefundSchema, await call("GET", `/refunds/${id}`), "refund");
    },
    async createRefund(p) {
      const json = await call("POST", "/refunds", `refund_${p.refundId}`, {
        payment_id: p.paymentId,
        amount: { value: kopecksToRubString(p.amount), currency: "RUB" },
        description: p.description,
        receipt: p.receipt,
      });
      return parseOr(yookassaRefundSchema, json, "refund");
    },
  };
}

/** Базовый URL API: переопределение YOOKASSA_API_URL (fake-сервер, локальные тесты) игнорируется в production. */
export function resolveYookassaBaseUrl(vars: { NODE_ENV?: string; YOOKASSA_API_URL?: string } = process.env): string {
  const override = vars.YOOKASSA_API_URL?.trim();
  if (!override || vars.NODE_ENV === "production") return YOOKASSA_API_URL;
  const url = new URL(override); // невалидный URL в dev — явная ошибка
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("YOOKASSA_API_URL: только http(s)");
  return override.replace(/\/$/, "");
}

let defaultClient: Promise<YookassaClient> | null = null;

/** Экземпляр по умолчанию из env; env.ts импортируется при первом вызове, а не при импорте модуля. */
export function getYookassaClient(): Promise<YookassaClient> {
  defaultClient ??= import("@/lib/env").then(({ env }) =>
    createYookassaClient({ baseUrl: resolveYookassaBaseUrl(), shopId: env.YOOKASSA_SHOP_ID, secretKey: env.YOOKASSA_SECRET_KEY }),
  ).catch((err: unknown) => {
    defaultClient = null;
    throw err;
  });
  return defaultClient;
}

export const createPayment = async (p: CreatePaymentParams) => (await getYookassaClient()).createPayment(p);
export const getPayment = async (id: string) => (await getYookassaClient()).getPayment(id);
export const getRefund = async (id: string) => (await getYookassaClient()).getRefund(id);
export const createRefund = async (p: CreateRefundParams) => (await getYookassaClient()).createRefund(p);
