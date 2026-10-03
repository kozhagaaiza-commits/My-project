"use client";

import { useState } from "react";
import { ProductFormSection } from "@/components/admin/products/ProductFormSection";
import { ImageDropzone } from "@/components/admin/products/ImageDropzone";
import { ImageTile } from "@/components/admin/products/ImageTile";
import { UploadTile } from "@/components/admin/products/UploadTile";
import type { useAdminProductImages } from "@/hooks/use-admin-products-images";
import { MAX_IMAGES } from "@/lib/admin-products-ui/images";
import type { AdminProductType } from "@/lib/admin-products-ui/types";

interface PhotosSectionProps {
  /** null — товар ещё не сохранён. */
  productId: string | null;
  type: AdminProductType;
  photos: ReturnType<typeof useAdminProductImages>;
  /** VALIDATION_ERROR «Добавьте хотя бы одно фото» и подобные. */
  error: string | null;
}

export function PhotosSection({ productId, type, photos, error }: PhotosSectionProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const aspect = type === "wheel_set" ? "square" : "landscape";

  if (productId === null) {
    return (
      <ProductFormSection id="product-photos" title="Фото">
        <p className="text-sm text-muted-foreground">Сохраните черновик, чтобы добавить фото</p>
      </ProductFormSection>
    );
  }

  return (
    <ProductFormSection id="product-photos" title="Фото">
      <ImageDropzone disabled={photos.full} onFiles={(files) => void photos.addFiles(files)} />
      <p className="text-sm text-muted-foreground">
        {photos.images.length} из {MAX_IMAGES}. Первое фото — главное; порядок меняется перетаскиванием.
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {(photos.images.length > 0 || photos.uploads.length > 0) && (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
          {photos.images.map((img, i) => (
            <ImageTile
              key={img.id}
              image={img}
              index={i}
              total={photos.images.length}
              aspect={aspect}
              dragging={dragIndex === i}
              onMove={photos.move}
              onAltChange={photos.setAlt}
              onAltCommit={photos.commitAlt}
              onRemove={(id) => void photos.remove(id)}
              onDragStart={setDragIndex}
              onDrop={(to) => {
                if (dragIndex !== null) photos.move(dragIndex, to);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
            />
          ))}
          {photos.uploads.map((u) => (
            <UploadTile key={u.id} item={u} aspect={aspect} />
          ))}
        </ul>
      )}
    </ProductFormSection>
  );
}
