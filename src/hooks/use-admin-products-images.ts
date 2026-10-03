"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { adminRequest, errorText, uploadAdminImage } from "@/lib/admin-products-ui/api";
import { prepareImage } from "@/lib/admin-products-ui/image-compress";
import {
  MAX_IMAGES, moveItem, takeFreeSlots, toReorderPayload, validateImageFile, withSortOrder,
} from "@/lib/admin-products-ui/images";
import type { AdminImage } from "@/lib/admin-products-ui/types";

export interface UploadItem {
  id: string;
  name: string;
  /** 0–100. */
  progress: number;
  previewUrl: string;
}

const MAX_BYTES_AFTER_COMPRESS = 5 * 1024 * 1024;

/**
 * Фото товара (после первого сохранения): загрузка с прогрессом, порядок, alt, удаление.
 * Изменения порядка и подписей сразу уходят на сервер (PATCH …/images); при ошибке список откатывается.
 */
export function useAdminProductImages(productId: string | null, initial: readonly AdminImage[]) {
  const [images, setImages] = useState<AdminImage[]>(() => [...initial]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const imagesRef = useRef(images);
  const pendingRef = useRef(0);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const base = productId === null ? null : `/api/admin/products/${productId}/images`;

  const persist = useCallback(
    async (next: AdminImage[], rollback: AdminImage[] | null) => {
      if (base === null) return;
      const r = await adminRequest("PATCH", base, toReorderPayload(next));
      if (!r.ok) {
        toast.error(errorText(r));
        if (rollback) setImages(rollback);
      }
    },
    [base],
  );

  const uploadOne = useCallback(
    async (file: File) => {
      if (base === null) return;
      const invalid = validateImageFile(file);
      if (invalid) return void toast.error(`${file.name}: ${invalid}`);
      const id = crypto.randomUUID();
      const item: UploadItem = { id, name: file.name, progress: 0, previewUrl: URL.createObjectURL(file) };
      setUploads((u) => [...u, item]);
      try {
        const prepared = await prepareImage(file);
        if (prepared.blob.size > MAX_BYTES_AFTER_COMPRESS) return void toast.error(`${file.name}: Файл больше 5 МБ`);
        const r = await uploadAdminImage<AdminImage>(base, prepared.blob, prepared.name, "", (progress) =>
          setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress } : x))),
        );
        if (r.ok) setImages((list) => [...list, { ...r.data, sort_order: list.length }]);
        else toast.error(errorText(r));
      } finally {
        URL.revokeObjectURL(item.previewUrl);
        setUploads((u) => u.filter((x) => x.id !== id));
      }
    },
    [base],
  );

  /** Файлы из выбора/перетаскивания загружаются по очереди; сверх 8 штук — toast «У товара уже 8 фото». */
  const addFiles = useCallback(
    async (files: File[]) => {
      const { accepted, rejected } = takeFreeSlots(files, imagesRef.current.length + pendingRef.current, MAX_IMAGES);
      if (rejected > 0) toast.error(`У товара уже ${MAX_IMAGES} фото`);
      pendingRef.current += accepted.length;
      for (const file of accepted) {
        await uploadOne(file);
        pendingRef.current -= 1;
      }
    },
    [uploadOne],
  );

  const move = useCallback(
    (from: number, to: number) => {
      const prev = imagesRef.current;
      const next = withSortOrder(moveItem(prev, from, to));
      setImages(next);
      void persist(next, prev);
    },
    [persist],
  );

  const setAlt = useCallback((id: string, alt: string) => {
    setImages((list) => list.map((x) => (x.id === id ? { ...x, alt } : x)));
  }, []);

  /** Подпись сохраняется на blur поля. */
  const commitAlt = useCallback(() => {
    if (imagesRef.current.length > 0) void persist(imagesRef.current, null);
  }, [persist]);

  const remove = useCallback(
    async (id: string) => {
      if (base === null) return;
      const r = await adminRequest("DELETE", `${base}/${id}`);
      if (!r.ok) return void toast.error(errorText(r));
      const next = withSortOrder(imagesRef.current.filter((x) => x.id !== id));
      setImages(next);
      if (next.length > 0) void persist(next, null);
    },
    [base, persist],
  );

  return { images, uploads, addFiles, move, setAlt, commitAlt, remove, full: images.length + uploads.length >= MAX_IMAGES };
}
