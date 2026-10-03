"use client";

import { useRef, useState, type DragEvent } from "react";
import { ImagePlus } from "lucide-react";
import { ACCEPTED_TYPES } from "@/lib/admin-products-ui/images";
import { cn } from "@/lib/utils";

interface ImageDropzoneProps {
  disabled: boolean;
  onFiles: (files: File[]) => void;
}

/** Зона загрузки: клик (выбор файлов) и drag & drop. Загрузку и лимиты проверяет вызывающий код. */
export function ImageDropzone({ disabled, onFiles }: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-md border-2 border-dashed px-4 py-8 text-center text-sm transition-colors hover:border-silver/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          over && "border-silver bg-muted",
        )}
      >
        <ImagePlus className="size-8 text-silver" aria-hidden />
        <span className="font-medium">Перетащите фото или нажмите для выбора</span>
        <span className="text-muted-foreground">JPG, PNG или WebP, до 5 МБ, не больше 8 фото</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        multiple
        hidden
        data-testid="image-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
    </>
  );
}
