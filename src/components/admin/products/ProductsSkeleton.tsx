import { Skeleton } from "@/components/ui/skeleton";

/** Loading списка: 10 строк (таблица на md+, карточки на mobile). */
export function ProductsSkeleton() {
  return (
    <div role="status" aria-label="Загрузка списка" data-testid="products-skeleton">
      <div className="hidden space-y-2 md:block">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
