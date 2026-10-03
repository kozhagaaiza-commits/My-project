"use client";

import { useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ProductImage } from "@/types/catalog";

interface GalleryLightboxProps {
  images: ProductImage[];
  /** Индекс открытого фото; null — закрыто. */
  index: number | null;
  title: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const SWIPE_MIN_PX = 50;

/** Полноэкранный просмотр: стрелки ChevronLeft/ChevronRight, клавиши ←/→, свайп на touch-экранах. */
export function GalleryLightbox({ images, index, title, onIndexChange, onClose }: GalleryLightboxProps) {
  const touchX = useRef<number | null>(null);
  const count = images.length;
  const current = index === null ? null : images[index];
  const go = (delta: number) => {
    if (index !== null && count > 1) onIndexChange((index + delta + count) % count);
  };

  return (
    <Dialog open={index !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="h-dvh w-screen max-w-none gap-0 rounded-none border-0 bg-black p-0 sm:max-w-none"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") go(-1);
          if (e.key === "ArrowRight") go(1);
        }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Фото {(index ?? 0) + 1} из {count}
        </DialogDescription>
        <div
          className="relative size-full"
          onTouchStart={(e) => {
            touchX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchX.current;
            const end = e.changedTouches[0]?.clientX;
            touchX.current = null;
            if (start === null || end === undefined) return;
            if (end - start > SWIPE_MIN_PX) go(-1);
            else if (start - end > SWIPE_MIN_PX) go(1);
          }}
        >
          {current && <Image src={current.url} alt={current.alt} fill sizes="100vw" placeholder="empty" className="object-contain" />}
        </div>
        {count > 1 && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="absolute top-1/2 left-2 -translate-y-1/2 bg-black/40"
              aria-label="Предыдущее фото"
              onClick={() => go(-1)}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="absolute top-1/2 right-2 -translate-y-1/2 bg-black/40"
              aria-label="Следующее фото"
              onClick={() => go(1)}
            >
              <ChevronRight aria-hidden />
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
