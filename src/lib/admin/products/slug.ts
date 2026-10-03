import { DbError } from "@/lib/orders/errors";

// SLUG_TAKEN / SKU_TAKEN (Блок 3, POST /api/admin/products): уникальность — unique-индексы products.slug/sku (2.4).
// Сервер не проверяет заранее: insert/update ловит 23505 и по имени ограничения понимает, что занято.

const SLUG_MAX = 120;

/**
 * Свободный вариант `<slug>-2`, `<slug>-3`, … (пример Блока 3: «…-graphite-2»). Основа укорачивается, чтобы
 * результат не превышал 120 символов и не заканчивался дефисом.
 */
export function suggestSlug(slug: string, taken: Iterable<string>): string {
  const busy = new Set(taken);
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const base = slug.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, "");
    const candidate = `${base}${suffix}`;
    if (!busy.has(candidate)) return candidate;
  }
}

export type UniqueViolation = "slug" | "sku" | null;

/** 23505 на products: какой ключ занят (products_slug_key / Key (slug)=…). Иначе null. */
export function productUniqueViolation(err: unknown): UniqueViolation {
  if (!(err instanceof DbError) || err.pgCode !== "23505") return null;
  const m = err.pgMessage;
  if (/products_slug_key|\(slug\)/.test(m)) return "slug";
  if (/products_sku_key|\(sku\)/.test(m)) return "sku";
  return null;
}

export const skuTakenMessage = (sku: string) => `Артикул ${sku} уже есть в каталоге`;
export const SLUG_TAKEN_MESSAGE = "Такой адрес уже используется";
