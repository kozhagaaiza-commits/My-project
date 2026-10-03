import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-error";

// Общие ответы Route Handlers админки товаров и автомобилей (Блок 3.0). Без env и БД.

export const ADMIN_NO_STORE = "private, no-store";
/** per_page списков админки (Блок 3: meta.per_page = 20). */
export const ADMIN_PAGE_SIZE = 20;
export const FORM_INVALID_MESSAGE = "Проверьте поля формы";
export const INTERNAL_MESSAGE = "Что-то пошло не так. Мы уже разбираемся";

export type FieldErrors = Record<string, string[] | undefined>;

export function okJson(data: unknown, status = 200, meta?: unknown): Response {
  return NextResponse.json(meta === undefined ? { data } : { data, meta }, { status });
}

/** 400 VALIDATION_ERROR; details.fields = z.flattenError(err).fieldErrors (3.0). */
export function zodError(error: z.ZodError, message: string = FORM_INVALID_MESSAGE): Response {
  return apiError("VALIDATION_ERROR", message, 400, { fields: z.flattenError(error).fieldErrors });
}

/** 400 VALIDATION_ERROR с ошибками конкретных полей (проверки сервера поверх Zod). */
export function fieldError(fields: FieldErrors, message: string = FORM_INVALID_MESSAGE): Response {
  return apiError("VALIDATION_ERROR", message, 400, { fields });
}

/** Первое сообщение Zod — для эндпоинтов, где Блок 3 показывает конкретный текст (загрузка фото). */
export function firstIssueMessage(error: z.ZodError, fallback: string = FORM_INVALID_MESSAGE): string {
  return error.issues[0]?.message ?? fallback;
}

/** Тело JSON; пустое или битое → null (Zod вернёт 400 с fields = {} или по полям). */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return JSON.parse(await request.text());
  } catch {
    return null;
  }
}

/** URLSearchParams → объект для Zod (повтор ключа: берётся первый). */
export function queryObject(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URL(url).searchParams) if (!(k in out)) out[k] = v;
  return out;
}

/** Неверный uuid в пути → тот же 404, что и несуществующая запись (нечего валидировать как форму). */
export const isUuid = (v: string) => z.uuid().safeParse(v).success;

/**
 * Обёртка обработчика: неожиданное исключение → 500 INTERNAL_ERROR (стек — только в console.error),
 * ответы админки никогда не кэшируются (в них закупочные цены).
 */
export async function runAdmin(scope: string, fn: () => Promise<Response>, extra: Record<string, unknown> = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fn();
  } catch (err) {
    console.error({ scope, ...extra, err });
    res = apiError("INTERNAL_ERROR", INTERNAL_MESSAGE, 500);
  }
  res.headers.set("Cache-Control", ADMIN_NO_STORE);
  return res;
}
