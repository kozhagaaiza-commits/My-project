import { Skeleton } from "@/components/ui/skeleton";

/** Loading: 10 строк таблицы (md+) / карточек (mobile). */
export function OrdersSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загрузка заказов" className="flex flex-col gap-2">
      {Array.from({ length: 10 }, (_, i) => (
        <Skeleton key={i} className="h-16 rounded-lg md:h-12" />
      ))}
    </div>
  );
}
