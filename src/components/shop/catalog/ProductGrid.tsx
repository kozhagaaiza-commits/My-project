import { ProductCard } from "@/components/shop/ProductCard";
import { cn } from "@/lib/utils";
import type { ProductListItem, ProductType } from "@/types/catalog";

interface ProductGridProps {
  type: ProductType;
  products: ProductListItem[];
  vehicleId: string | null;
}

const WHEEL_SIZES = "(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw";
const CARBON_SIZES = "(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 40vw";

/** Диски: desktop 4 / tablet 3 / mobile 2. Карбон: 3 / 2 / 1 (горизонтальная карточка). */
export function ProductGrid({ type, products, vehicleId }: ProductGridProps) {
  const wheels = type === "wheel_set";
  return (
    <ul
      className={cn(
        "grid gap-3 md:gap-4",
        wheels ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard
            product={p}
            vehicleId={vehicleId}
            mobileLayout={wheels ? "stacked" : "row"}
            sizes={wheels ? WHEEL_SIZES : CARBON_SIZES}
            priority={i < 4}
          />
        </li>
      ))}
    </ul>
  );
}
