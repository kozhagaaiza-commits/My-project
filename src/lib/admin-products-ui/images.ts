// Чистая логика фото товара: лимиты, проверка файла, порядок, размеры сжатия (Блок 5.9.5, Edge Cases 30–31).
import type { AdminImage } from "@/lib/admin-products-ui/types";

export const MAX_IMAGES = 8;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const COMPRESS_MAX_SIDE = 1600;
export const ALT_MAX = 200;

/** Сообщения те же, что у imageUploadForm (Блок 3). */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return "Только JPG, PNG или WebP";
  if (file.size > MAX_FILE_BYTES) return "Файл больше 5 МБ";
  return null;
}

/** Размер после вписывания в квадрат side×side без увеличения. */
export function fitWithin(width: number, height: number, side: number = COMPRESS_MAX_SIDE): { width: number; height: number } {
  const k = Math.min(1, side / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** Сколько файлов из пачки можно загрузить, не превысив лимит; остальные отбрасываются. */
export function takeFreeSlots<T>(files: readonly T[], current: number, max: number = MAX_IMAGES): { accepted: T[]; rejected: number } {
  const free = Math.max(0, max - current);
  return { accepted: files.slice(0, free), rejected: Math.max(0, files.length - free) };
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** sort_order = индекс в массиве (0…7). */
export const withSortOrder = (list: readonly AdminImage[]): AdminImage[] =>
  list.map((img, i) => ({ ...img, sort_order: i }));

export const sortImages = (list: readonly AdminImage[]): AdminImage[] =>
  [...list].sort((a, b) => a.sort_order - b.sort_order);

/** Тело PATCH /api/admin/products/[id]/images. */
export const toReorderPayload = (list: readonly AdminImage[]) => ({
  images: list.map((img, i) => ({ id: img.id, sort_order: i, alt: img.alt.trim().slice(0, ALT_MAX) })),
});
