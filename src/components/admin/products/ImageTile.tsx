"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ALT_MAX } from "@/lib/admin-products-ui/images";
import type { AdminImage } from "@/lib/admin-products-ui/types";
import { cn } from "@/lib/utils";

interface ImageTileProps {
  image: AdminImage;
  index: number;
  total: number;
  aspect: "square" | "landscape";
  dragging: boolean;
  onMove: (from: number, to: number) => void;
  onAltChange: (id: string, alt: string) => void;
  onAltCommit: () => void;
  onRemove: (id: string) => void;
  onDragStart: (index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
}

/** Превью сохранённого фото: перетаскивание порядка, кнопки «влево/вправо», alt, удаление. */
export function ImageTile({
  image, index, total, aspect, dragging, onMove, onAltChange, onAltCommit, onRemove, onDragStart, onDrop, onDragEnd,
}: ImageTileProps) {
  const n = index + 1;
  return (
    <li
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(index);
      }}
      onDragEnd={onDragEnd}
      className={cn("flex cursor-grab flex-col gap-2 rounded-md border bg-background p-2 active:cursor-grabbing", dragging && "opacity-40")}
      data-testid="image-tile"
    >
      <div className={cn("relative overflow-hidden rounded-sm bg-card", aspect === "square" ? "aspect-square" : "aspect-[4/3]")}>
        <Image
          src={image.url}
          alt={image.alt || `Фото ${n}`}
          fill
          sizes="(min-width: 1024px) 160px, (min-width: 768px) 25vw, 45vw"
          placeholder="empty"
          draggable={false}
          className="object-cover"
        />
      </div>
      <Input
        value={image.alt}
        maxLength={ALT_MAX}
        placeholder="Подпись (alt)"
        aria-label={`Подпись к фото ${n}`}
        onChange={(e) => onAltChange(image.id, e.target.value)}
        onBlur={onAltCommit}
        className="h-8 text-sm"
      />
      <div className="flex items-center justify-between gap-1">
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="icon-sm" aria-label={`Фото ${n}: переместить влево`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label={`Фото ${n}: переместить вправо`} disabled={index === total - 1} onClick={() => onMove(index, index + 1)}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Удалить фото ${n}`} onClick={() => onRemove(image.id)}>
          <Trash2 aria-hidden />
        </Button>
      </div>
    </li>
  );
}
