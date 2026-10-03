"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import { GalleryLightbox } from "@/components/shop/product/GalleryLightbox";
import { cn } from "@/lib/utils";
import type { ProductImage, ProductType } from "@/types/catalog";

interface ProductGalleryProps {
  images: ProductImage[];
  type: ProductType;
  title: string;
}

const MAX_IMAGES = 8; // главное фото + до 7 миниатюр (US-002: до 8 фото)
const SIZES = "(min-width: 1024px) 58vw, (min-width: 768px) 50vw, 100vw";

/**
 * Галерея: горизонтальный scroll-snap (на mobile — свайп + точки), на md+ — миниатюры под главным фото.
 * Клик по фото открывает полноэкранный просмотр. 1:1 для дисков, 4:3 для карбона.
 */
export function ProductGallery({ images, type, title }: ProductGalleryProps) {
  const list = images.slice(0, MAX_IMAGES);
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const ratio = type === "wheel_set" ? "aspect-square" : "aspect-[4/3]";

  if (list.length === 0) {
    return (
      <div className={cn("flex w-full items-center justify-center rounded-lg bg-card", ratio)} role="img" aria-label="Фото недоступно">
        <ImageOff className="size-12 text-muted-foreground" aria-hidden />
      </div>
    );
  }

  const goTo = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setActive(i);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={track}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-lg bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth > 0) setActive(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {list.map((img, i) => (
          <button
            key={`${img.url}-${i}`}
            type="button"
            className={cn("relative w-full shrink-0 snap-center cursor-zoom-in focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset", ratio)}
            aria-label={`Открыть фото ${i + 1} на весь экран`}
            onClick={() => setLightbox(i)}
          >
            <Image src={img.url} alt={img.alt} fill sizes={SIZES} placeholder="empty" priority={i === 0} className="object-cover" />
          </button>
        ))}
      </div>

      {list.length > 1 && (
        <>
          <div className="flex justify-center gap-2 md:hidden" role="group" aria-label="Фото товара">
            {list.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Фото ${i + 1}`}
                aria-current={i === active}
                onClick={() => goTo(i)}
                className="flex size-11 items-center justify-center"
              >
                <span className={cn("size-2 rounded-full", i === active ? "bg-silver" : "bg-border")} />
              </button>
            ))}
          </div>
          <div className="hidden grid-cols-4 gap-2 md:grid" role="group" aria-label="Миниатюры">
            {list.map((img, i) => (
              <button
                key={`${img.url}-${i}`}
                type="button"
                aria-label={`Показать фото ${i + 1}`}
                aria-current={i === active}
                onClick={() => goTo(i)}
                className={cn(
                  "relative overflow-hidden rounded-md border bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  ratio,
                  i === active ? "border-silver" : "border-border opacity-70 hover:opacity-100",
                )}
              >
                <Image src={img.url} alt="" fill sizes="12vw" placeholder="empty" className="object-cover" />
              </button>
            ))}
          </div>
        </>
      )}

      <GalleryLightbox
        images={list}
        index={lightbox}
        title={title}
        onIndexChange={setLightbox}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
