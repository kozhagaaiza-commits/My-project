"use client";

import { COMPRESS_MAX_SIDE, fitWithin } from "@/lib/admin-products-ui/images";

export interface PreparedImage {
  blob: Blob;
  name: string;
}

const WEBP_QUALITY = 0.85;

function toWebpBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
}

/**
 * Edge Case 30: перед загрузкой фото сжимается в браузере до 1600px по длинной стороне, WebP.
 * Если сжать не удалось (старый браузер, битый файл) или результат больше исходника — уходит оригинал;
 * проверка 5 МБ выполняется после этого в вызывающем коде.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitWithin(bitmap.width, bitmap.height, COMPRESS_MAX_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, name: file.name };
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const webp = await toWebpBlob(canvas);
    if (webp && webp.type === "image/webp" && (webp.size < file.size || file.size > 5 * 1024 * 1024)) {
      return { blob: webp, name: `${file.name.replace(/\.[^.]+$/, "") || "photo"}.webp` };
    }
  } catch {
    // сжать не удалось — отправляем исходный файл
  }
  return { blob: file, name: file.name };
}
