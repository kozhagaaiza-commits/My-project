import "server-only";
import { z } from "zod";
import { kopecksToRubString } from "@/lib/money";
import { YookassaApiError, YookassaResponseError, YookassaUnavailableError, yookassaErrorBody } from "./errors";
import {
  buildReceipt, yookassaPaymentSchema, yookassaRefundSchema,
  type ReceiptItemInput, type YookassaPayment, type YookassaReceipt, type YookassaRefund,
} from "./schemas";

// HTTP-клиент ЮKassa API v3 (Чертёж 5.9.1): Basic-аутентификация; до 3 попыток (0 / 1 / 3 с) с ТЕМ ЖЕ Idempotence-Key
// при сетевой ошибке, таймауте, 5xx, 202 (ещё обрабатывается), 429 и 409 на POST (ключ занят параллельным запросом);
// retry_after из тела (мс) удлиняет паузу; прочие 4xx не повторяются. Таймаут попытки — 15 с.
// deadlineMs — общий бюджет вызова: новые попытки после него не начинаются, таймаут попытки урезается до остатка.

export const YOOKASSA_API_URL = "https://api.yookassa.ru/v3";
const RETRY_DELAYS_MS = [0, 1000, 3000];
const TIMEOUT_MS = 15000;
const MAX_RETRY_AFTER_MS = 10000;
const OBJECT_ID = /^[A-Za-z0-9_-]{1,64}$/;

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

/** deadlineMs — общий бюджет вызова в мс (все попытки и паузы); не задан — без ограничения. */
export interface CallOptions {
  deadlineMs?: number;
}

export interface YookassaClient {
  createPayment(p: CreatePaymentParams, opts?: CallOptions): Promise<YookassaPayment>;
  getPayment(id: string, opts?: CallOptions): Promise<YookassaPayment>;
  getRefund(id: string, opts?: CallOptions): Promise<YookassaRefund>;
  createRefund(p: CreateRefundParams, opts?: CallOptions): Promise<YookassaRefund>;
}

export interface YookassaClientConfig {
  shopId: string;
  secretKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Часы для дедлайна (мс); в тестах — вместе с мгновенным sleep. */
  clock?: () => number;
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

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  try { return JSON.parse(text); } catch { return null; }
}

function isRetryableStatus(status: number, method: string): boolean {
  return status >= 500 || status === 202 || status === 429 || (status === 409 && method === "POST");
}

export function createYookassaClient(cfg: YookassaClientConfig): YookassaClient {
  const api = (cfg.baseUrl ?? YOOKASSA_API_URL).replace(/\/$/, "");
  const auth = "Basic " + Buffer.from(`${cfg.shopId}:${cfg.secretKey}`).toString("base64");
  const doFetch = cfg.fetchImpl ?? fetch;
  const sleep = cfg.sleep ?? realSleep;
  const clock = cfg.clock ?? Date.now;
  const timeoutMs = cfg.timeoutMs ?? TIMEOUT_MS;

  async function call(method: "GET" | "POST", path: string, opts: CallOptions, idempotenceKey?: string, body?: unknown): Promise<unknown> {
    const deadline = opts.deadlineMs === undefined ? Number.POSITIVE_INFINITY : clock() + Math.max(0, opts.deadlineMs);
    let lastError: unknown = new Error("deadline exceeded before first attempt");
    let retryAfter = 0;
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      const delay = attempt === 0 ? 0 : Math.max(RETRY_DELAYS_MS[attempt], retryAfter);
      if (clock() + delay >= deadline) break; // новая попытка не уложится в бюджет
      if (delay) await sleep(delay);
      const remaining = deadline - clock();
      if (remaining <= 0) break;
      retryAfter = 0;
      try {
        const res = await doFetch(api + path, {
          method,
          headers: {
            Authorization: auth,
            "Content-Type": "application/json",
            ...(idempotenceKey ? { "Idempotence-Key": idempotenceKey } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, remaining))),
          cache: "no-store",
        });
        if (isRetryableStatus(res.status, method)) {
          const parsed = yookassaErrorBody.safeParse(await readJson(res));
          const ra = parsed.success ? parsed.data.retry_after : undefined;
          retryAfter = typeof ra === "number" && ra > 0 ? Math.min(ra, MAX_RETRY_AFTER_MS) : 0;
          lastError = new Error(`YooKassa ${res.status}`);
          continue;
        }
        if (!res.ok) {
          const parsed = yookassaErrorBody.safeParse(await readJson(res)); // 4xx — не повторяем, даже если тело не JSON
          throw new YookassaApiError(res.status, parsed.success ? parsed.data : { description: `HTTP ${res.status}` });
        }
        return await res.json(); // битый JSON в 2xx — повтор (как в Чертеже)
      } catch (e: unknown) {
        if (e instanceof YookassaApiError) throw e;
        lastError = e;
      }
    }
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new YookassaUnavailableError(`YooKassa недоступна: ${method} /${path.split("/")[1] ?? ""}: ${reason}`, { cause: lastError });
  }

  return {
    async createPayment(p, opts = {}) {
      const json = await call("POST", "/payments", opts, `order_${p.orderId}_${p.attempt}`, {
        amount: { value: kopecksToRubString(p.amount), currency: "RUB" },
        capture: true,
        confirmation: { type: "redirect", return_url: p.returnUrl },
        description: `Заказ ${p.orderNumber}`,
        metadata: { order_id: p.orderId, order_number: p.orderNumber },
        receipt: buildReceipt({ email: p.email, phone: p.phone, items: p.items }),
      });
      return parseOr(yookassaPaymentSchema, json, "payment");
    },
    async getPayment(id, opts = {}) {
      assertObjectId(id, "платежа");
      return parseOr(yookassaPaymentSchema, await call("GET", `/payments/${id}`, opts), "payment");
    },
    async getRefund(id, opts = {}) {
      assertObjectId(id, "возврата");
      return parseOr(yookassaRefundSchema, await call("GET", `/refunds/${id}`, opts), "refund");
    },
    async createRefund(p, opts = {}) {
      const json = await call("POST", "/refunds", opts, `refund_${p.refundId}`, {
        payment_id: p.paymentId,
        amount: { value: kopecksToRubString(p.amount), currency: "RUB" },
        description: p.description,
        receipt: p.receipt,
      });
      return parseOr(yookassaRefundSchema, json, "refund");
    },
  };
}
