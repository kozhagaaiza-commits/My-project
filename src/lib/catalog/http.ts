import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-error";

// Общие ответы публичных Route Handlers каталога (Блок 3.0).

/**
 * Справочники авто (makes/models/years/[id]) кэшируются на CDN заголовком, а не `export const revalidate`:
 * обработчики читают searchParams и заголовки (IP для rate limit), поэтому всё равно динамические,
 * а ISR-кэш маршрута пропустил бы rate limit и потребовал бы БД при сборке.
 */
export const PUBLIC_DICTIONARY_CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";
/** Каталог товаров: остатки меняются, у ателье — свои цены. Никогда не кэшируется общим кэшем. */
export const PRIVATE_NO_STORE = "private, no-store";

export function ok<T>(data: T, cacheControl: string, meta?: unknown) {
  return NextResponse.json(meta === undefined ? { data } : { data, meta }, { headers: { "Cache-Control": cacheControl } });
}

export function validationError(message: string, error: z.ZodError) {
  return apiError("VALIDATION_ERROR", message, 400, { fields: z.flattenError(error).fieldErrors });
}

export function notFound(message: string) {
  return apiError("NOT_FOUND", message, 404);
}

export function internalError(scope: string, err: unknown, extra: Record<string, unknown> = {}) {
  console.error({ scope, ...extra, err });
  return apiError("INTERNAL_ERROR", "Что-то пошло не так. Мы уже разбираемся", 500);
}

/** URLSearchParams → объект для Zod (повторы ключа: берётся первый). */
export function queryObject(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URL(url).searchParams) if (!(k in out)) out[k] = v;
  return out;
}

/** Сообщение 400 для справочника авто: ошибка марки — «Неизвестная марка» (Блок 3), иначе общее. */
export function vehicleValidationMessage(error: z.ZodError): string {
  return "make" in z.flattenError(error).fieldErrors ? "Неизвестная марка" : "Неверные параметры запроса";
}
