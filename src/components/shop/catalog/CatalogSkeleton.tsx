import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ProductType } from "@/types/catalog";

/** Loading каталога: 8 карточек на desktop, 4 на mobile; фильтры остаются активными в реальной разметке. */
export function CatalogSkeleton({ type }: { type: ProductType }) {
  const wheels = type === "wheel_set";
  return (
    <div aria-hidden className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 md:gap-6 md:px-6 md:py-8">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-9 w-72 max-w-full" />
      <Skeleton className="h-10 w-full" />
      <div
        className={cn(
          "grid gap-3 md:gap-4",
          wheels ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className={cn(
              "space-y-3",
              i >= 4 && "hidden md:block",
              !wheels && "max-md:flex max-md:gap-3 max-md:space-y-0",
            )}
          >
            <Skeleton className={cn("w-full", wheels ? "aspect-square" : "aspect-[4/3] max-md:w-2/5 max-md:shrink-0")} />
            <div className={cn("space-y-2", !wheels && "max-md:flex-1")}>
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
