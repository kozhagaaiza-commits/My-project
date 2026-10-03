"use client";

import { Loader2 } from "lucide-react";
import { ProductPreviewSheet } from "@/components/admin/products/ProductPreviewSheet";
import { Button } from "@/components/ui/button";
import type { AdminImage, AdminProductStatus, AdminSettings } from "@/lib/admin-products-ui/types";

interface ProductActionBarProps {
  /** null — новый товар. */
  savedStatus: AdminProductStatus | null;
  submitting: AdminProductStatus | null;
  /** «Авто» без курса: публикация заблокирована. */
  publishBlocked: boolean;
  onSave: (status: AdminProductStatus) => void;
  settings: AdminSettings | null;
  images: readonly AdminImage[];
  reservedQty: number;
}

/**
 * Нижняя sticky-панель. Новый и черновик: outline «Сохранить черновик» + default «Опубликовать»
 * (у нового «Опубликовать» недоступна — публикация только после загрузки фото). Опубликованный: default «Сохранить».
 * Архивный: outline «Сохранить» + default «Опубликовать».
 */
export function ProductActionBar({ savedStatus, submitting, publishBlocked, onSave, settings, images, reservedQty }: ProductActionBarProps) {
  const busy = submitting !== null;
  const spin = (s: AdminProductStatus) => submitting === s && <Loader2 className="animate-spin" aria-hidden />;
  const published = savedStatus === "active";
  const archived = savedStatus === "archived";

  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6" data-testid="product-action-bar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProductPreviewSheet settings={settings} images={images} reservedQty={reservedQty} />
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          {savedStatus === null && <p className="hidden text-sm text-muted-foreground sm:block">Опубликовать можно после добавления фото</p>}
          {!published && (
            <Button type="button" variant="outline" disabled={busy} onClick={() => onSave(archived ? "archived" : "draft")}>
              {spin(archived ? "archived" : "draft")}
              {archived ? "Сохранить" : "Сохранить черновик"}
            </Button>
          )}
          {published ? (
            <Button type="button" disabled={busy || publishBlocked} onClick={() => onSave("active")}>
              {spin("active")}
              Сохранить
            </Button>
          ) : (
            <Button type="button" disabled={busy || savedStatus === null || publishBlocked} onClick={() => onSave("active")}>
              {spin("active")}
              Опубликовать
            </Button>
          )}
        </div>
      </div>
      {publishBlocked && (
        <p className="mt-2 text-right text-sm text-muted-foreground">Загрузите курс, чтобы опубликовать товар в режиме «Авто»</p>
      )}
    </div>
  );
}
