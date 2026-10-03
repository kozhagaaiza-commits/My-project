import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-error";

// Общие ответы /api/admin/* (Блок 3.0 и «Админка — заказы»). Все ответы — Cache-Control: private, no-store (ПДн).

export const ADMIN_NO_STORE = "private, no-store";

export const adminOk = <T>(data: T, meta?: unknown): Response =>
  NextResponse.json(meta === undefined ? { data } : { data, meta }, { headers: { "Cache-Control": ADMIN_NO_STORE } });

export const adminOrderNotFound = () => apiError("NOT_FOUND", "Заказ не найден", 404);

/** 409 оптимистической блокировки (Блок 3, PATCH заказа и статуса; Edge Case 14). */
export const orderConflict = () => apiError("CONFLICT", "Заказ изменили в другой вкладке. Обновите страницу", 409);

/** Общий текст 400 для форм (как у POST /api/orders). */
export const FORM_VALIDATION_MESSAGE = "Проверьте поля формы";

export function adminValidationError(error: z.ZodError, message: string = FORM_VALIDATION_MESSAGE): Response {
  return apiError("VALIDATION_ERROR", message, 400, { fields: z.flattenError(error).fieldErrors });
}

export function fieldValidationError(field: string, message: string): Response {
  return apiError("VALIDATION_ERROR", message, 400, { fields: { [field]: [message] } });
}

export function adminInternalError(scope: string, err: unknown, extra: Record<string, unknown> = {}): Response {
  console.error({ scope, ...extra, err });
  return apiError("INTERNAL_ERROR", "Что-то пошло не так. Мы уже разбираемся", 500);
}

/** Тело запроса как JSON; битый JSON / пустое тело → undefined (тогда Zod даст 400). */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** Принудительно private, no-store на любом ответе (в т. ч. 401/403/429 из guard). */
export function noStore(res: Response): Response {
  res.headers.set("Cache-Control", ADMIN_NO_STORE);
  return res;
}
