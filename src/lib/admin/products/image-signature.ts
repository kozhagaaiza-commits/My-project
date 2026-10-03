import type { ImageMimeType } from "@/lib/schemas/admin-products";

// Тип файла по сигнатуре (magic bytes), а не по заявленному браузером `type` (его задаёт клиент — подделывается).
// JPEG: FF D8 FF; PNG: 89 50 4E 47 0D 0A 1A 0A; WebP: «RIFF» <4 байта размера> «WEBP».

export const SIGNATURE_BYTES = 12;

export function detectImageType(head: Uint8Array): ImageMimeType | null {
  const b = head;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export const EXTENSION: Record<ImageMimeType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Первые байты файла (File/Blob) без чтения всего содержимого. */
export async function readSignature(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, SIGNATURE_BYTES).arrayBuffer());
}
