import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton заголовка, 4 строки таймлайна и карточка состава (Блок 4, «Статус заказа» → Loading). */
export function OrderSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8" aria-busy="true" aria-label="Загрузка заказа">
      <div className="mb-5 flex items-center gap-4 md:mb-6">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
      <div className="grid gap-5 md:gap-6 lg:grid-cols-12 lg:gap-8">
        <Card className="gap-5 p-5 lg:col-span-7">
          <Skeleton className="h-6 w-32" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-4 w-48 max-w-full" />
            </div>
          ))}
        </Card>
        <Card className="gap-4 p-5 lg:col-span-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-8 w-full" />
        </Card>
      </div>
    </div>
  );
}
