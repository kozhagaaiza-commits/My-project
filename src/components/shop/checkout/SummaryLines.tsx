import Image from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CartValidateItem } from "@/types/cart";

interface SummaryLinesProps {
  items: CartValidateItem[];
  className?: string;
}

/** Позиции заказа: название, «количество × цена за единицу», сумма строки — цены только из ответа validate. */
export function SummaryLines({ items, className }: SummaryLinesProps) {
  return (
    <ul className={cn("flex flex-col divide-y divide-border", className)}>
      {items.map((line) => (
        <li key={line.product_id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
          <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-background">
            {line.cover_image_url ? (
              <Image src={line.cover_image_url} alt="" fill sizes="56px" className="object-cover" />
            ) : (
              <ImageOff className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="line-clamp-2 text-sm leading-snug font-medium">{line.title}</p>
            <div className="flex items-baseline justify-between gap-2 text-sm tabular-nums">
              <span className="text-muted-foreground">
                {line.quantity} × {line.unit_price_formatted}
              </span>
              <span className="font-semibold">{line.line_total_formatted}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
