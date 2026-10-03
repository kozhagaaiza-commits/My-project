import "server-only";
import { createYookassaClient, YOOKASSA_API_URL, type CallOptions, type CreatePaymentParams, type CreateRefundParams, type YookassaClient } from "@/lib/yookassa/client";

// Клиент ЮKassa API v3 (Чертёж 5.9.1). Модуль — точка входа: реэкспорт частей из src/lib/yookassa/
// (client — HTTP и повторы, schemas — Zod-схемы ответов и чек 54-ФЗ, errors — типы ошибок) и экземпляр по умолчанию.
// Отличия от кода Чертежа (решения Дня 4 и ревью):
//  - `catch (e: any)` → `unknown`; ошибки типизированы (YookassaApiError / YookassaUnavailableError / YookassaResponseError);
//  - фабрика createYookassaClient для тестов; экземпляр по умолчанию создаётся лениво (env не разбирается при импорте);
//  - повтор с тем же ключом также при 202, 429 и 409 (POST), с учётом retry_after; 4xx с телом не-JSON не повторяется;
//  - общий дедлайн вызова (CallOptions.deadlineMs): после него новые попытки не начинаются;
//  - YOOKASSA_API_URL переопределяет базовый URL ТОЛЬКО при NODE_ENV !== "production".

export { YOOKASSA_API_URL, createYookassaClient } from "@/lib/yookassa/client";
export type { CallOptions, CreatePaymentParams, CreateRefundParams, YookassaClient, YookassaClientConfig } from "@/lib/yookassa/client";
export { YookassaApiError, YookassaResponseError, YookassaUnavailableError } from "@/lib/yookassa/errors";
export type { YookassaErrorBody } from "@/lib/yookassa/errors";
export { YOOKASSA_VAT_CODE, buildReceipt, yookassaPaymentSchema, yookassaRefundSchema } from "@/lib/yookassa/schemas";
export type {
  ReceiptItemInput, YookassaPayment, YookassaPaymentStatus, YookassaReceipt, YookassaRefund,
} from "@/lib/yookassa/schemas";

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

export const createPayment = async (p: CreatePaymentParams, opts?: CallOptions) => (await getYookassaClient()).createPayment(p, opts);
export const getPayment = async (id: string, opts?: CallOptions) => (await getYookassaClient()).getPayment(id, opts);
export const getRefund = async (id: string, opts?: CallOptions) => (await getYookassaClient()).getRefund(id, opts);
export const createRefund = async (p: CreateRefundParams, opts?: CallOptions) => (await getYookassaClient()).createRefund(p, opts);
