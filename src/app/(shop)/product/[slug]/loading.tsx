import { Skeleton } from "@/components/ui/skeleton";

/** Квадрат галереи + 6 строк справа (Блок 4, «Карточка товара» → Loading). */
export default function ProductLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8" aria-busy="true" aria-label="Загрузка товара">
      <Skeleton className="mb-5 h-4 w-64 max-w-full" />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-12 lg:gap-10">
        <Skeleton className="aspect-square w-full lg:col-span-7" />
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}
