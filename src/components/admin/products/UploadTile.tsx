import Image from "next/image";
import { Progress } from "@/components/ui/progress";
import type { UploadItem } from "@/hooks/use-admin-products-images";
import { cn } from "@/lib/utils";

interface UploadTileProps {
  item: UploadItem;
  aspect: "square" | "landscape";
}

/** Фото в процессе загрузки: превью + Progress. */
export function UploadTile({ item, aspect }: UploadTileProps) {
  return (
    <li className="flex flex-col gap-2 rounded-md border bg-background p-2" data-testid="upload-tile">
      <div className={cn("relative overflow-hidden rounded-sm bg-card", aspect === "square" ? "aspect-square" : "aspect-[4/3]")}>
        <Image src={item.previewUrl} alt="" fill sizes="160px" placeholder="empty" className="object-cover opacity-60" unoptimized />
      </div>
      <Progress value={item.progress} aria-label={`Загрузка ${item.name}`} />
      <p className="truncate text-xs text-muted-foreground">{item.name}</p>
    </li>
  );
}
