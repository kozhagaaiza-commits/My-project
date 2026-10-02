import Image from "next/image";
import Link from "next/link";
import { Disc3 } from "lucide-react";
import { AvailabilityBadge } from "@/components/shop/AvailabilityBadge";
import { FitmentNote } from "@/components/shop/FitmentNote";
import { PriceTag } from "@/components/shop/PriceTag";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ProductListItem } from "@/types/catalog";

interface ProductCardProps {
  product: ProductListItem;
  /** Если выбран автомобиль — ссылка ведёт на /product/[slug]?vehicle=<id>. */
  vehicleId?: string | null;
  /** Карбон в каталоге на mobile: фото слева 40%, текст справа. */
  mobileLayout?: "stacked" | "row";
  sizes: string;
  priority?: boolean;
  className?: string;
}

export function ProductCard({ product, vehicleId, mobileLayout = "stacked", sizes, priority, className }: ProductCardProps) {
  const isWheel = product.type === "wheel_set";
  const row = mobileLayout === "row";
  const href = `/product/${product.slug}${vehicleId ? `?vehicle=${encodeURIComponent(vehicleId)}` : ""}`;

  return (
    <Card
      className={cn(
        "relative h-full gap-0 overflow-hidden py-0 transition-colors hover:border-silver/50 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring",
        row && "max-md:flex-row",
        className,
      )}
    >
      <div
        className={cn(
          "relative shrink-0 bg-card",
          isWheel ? "aspect-square" : "aspect-[4/3]",
          row && "max-md:w-2/5",
        )}
      >
        {product.cover_image ? (
          <Image
            src={product.cover_image.url}
            alt={product.cover_image.alt}
            fill
            sizes={sizes}
            placeholder="empty"
            priority={priority}
            className="object-cover"
          />
        ) : (
          <Disc3 className="absolute inset-0 m-auto size-12 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 md:p-4">
        <h3 className="line-clamp-2 text-sm leading-snug font-medium md:text-base">
          <Link
            href={href}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {product.title}
          </Link>
        </h3>
        {product.specs_short && (
          <p className="hidden font-mono text-xs text-muted-foreground md:block">{product.specs_short}</p>
        )}
        <FitmentNote fitment={product.fitment} />
        <AvailabilityBadge availability={product.availability} />
        <PriceTag
          className="mt-auto pt-1"
          price_formatted={product.price_formatted}
          price_atelier_formatted={product.price_atelier_formatted}
          unit={isWheel ? "за комплект" : "за 1 шт."}
        />
      </div>
    </Card>
  );
}
