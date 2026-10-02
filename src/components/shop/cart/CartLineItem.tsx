"use client";

import Image from "next/image";
import Link from "next/link";
import { ImageOff, Trash2 } from "lucide-react";
import { QuantityStepper } from "@/components/shop/QuantityStepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CartRow } from "@/hooks/use-cart-view";
import { isUnavailableLine } from "@/hooks/use-cart-view";
import { maxQuantityFor } from "@/lib/cart-store";
import { formatRub } from "@/lib/money";
import { cn } from "@/lib/utils";

interface CartLineItemProps {
  row: CartRow;
  /** Цен ещё нет (первый ответ validate не пришёл) — вместо суммы Skeleton. */
  pricesLoading: boolean;
  /** Количество изменилось, ответ ещё не пришёл — суммы устарели. */
  refreshing: boolean;
  onQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  /** Клик по ссылке на товар (CartSheet закрывается при переходе). */
  onNavigate?: () => void;
}

export function CartLineItem({ row, pricesLoading, refreshing, onQuantity, onRemove, onNavigate }: CartLineItemProps) {
  const { item, line } = row;
  const unavailable = isUnavailableLine(line);
  const mixed = line?.problem === "mixed_kind";
  const title = line?.title || item.title || "Товар";
  const slug = line?.slug || item.slug;
  const cover = line?.cover_image_url || null;
  const max = line?.max_quantity && line.max_quantity > 0 ? line.max_quantity : maxQuantityFor(item.type);
  const priceChanged = line !== null && !unavailable && !mixed && line.unit_price !== item.price_seen;
  const unit = item.type === "carbon_part" ? "шт." : "компл.";

  return (
    <li className="flex gap-3 border-b border-border py-4 last:border-b-0" data-problem={line?.problem ?? undefined}>
      <div className={cn("relative size-20 shrink-0 overflow-hidden rounded-md bg-card", unavailable && "opacity-40")}>
        {cover ? (
          <Image src={cover} alt="" fill sizes="80px" placeholder="empty" className="object-cover" />
        ) : (
          <ImageOff className="absolute inset-0 m-auto size-6 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("line-clamp-2 text-sm leading-snug font-medium", unavailable && "text-muted-foreground")}>
            {slug && !unavailable ? (
              <Link href={`/product/${slug}`} onClick={onNavigate} className="hover:underline focus-visible:underline">
                {title}
              </Link>
            ) : (
              title
            )}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-mt-1 -mr-2 shrink-0 text-muted-foreground"
            aria-label={`Удалить: ${title}`}
            onClick={() => onRemove(item.product_id)}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
        {item.specs_short && (
          <p className={cn("font-mono text-xs text-muted-foreground", unavailable && "opacity-60")}>{item.specs_short}</p>
        )}
        {unavailable && <Badge variant="outline" className="text-muted-foreground">Нет в наличии</Badge>}
        {mixed && (
          <p className="text-xs text-destructive">
            Детали под заказ и диски из наличия оформляются разными заказами
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <QuantityStepper
            size="sm"
            value={item.quantity}
            max={max}
            disabled={unavailable}
            label={`Количество, ${unit}`}
            onChange={(q) => onQuantity(item.product_id, q)}
          />
          {pricesLoading ? (
            <Skeleton className="h-5 w-20" />
          ) : line && !unavailable && !mixed ? (
            <p className={cn("text-sm font-semibold tabular-nums", refreshing && "opacity-50")} aria-busy={refreshing}>
              {line.line_total_formatted}
            </p>
          ) : null}
        </div>
        {priceChanged && !pricesLoading && (
          <p className="text-xs text-silver tabular-nums">
            Цена изменилась · было {formatRub(item.price_seen)} за {unit}
          </p>
        )}
      </div>
    </li>
  );
}
