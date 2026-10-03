import Image from "next/image";
import { ImageOff } from "lucide-react";

interface ProductThumbProps {
  url: string | null | undefined;
  title: string;
}

/** Миниатюра 48×48; без фото — иконка. */
export function ProductThumb({ url, title }: ProductThumbProps) {
  return (
    <div className="relative size-12 shrink-0 overflow-hidden rounded-md border bg-card">
      {url ? (
        <Image src={url} alt={title} fill sizes="48px" placeholder="empty" className="object-cover" />
      ) : (
        <ImageOff className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-label="Нет фото" />
      )}
    </div>
  );
}
