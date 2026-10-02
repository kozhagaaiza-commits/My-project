import { Skeleton } from "@/components/ui/skeleton";

/** Loading «Состава заказа» до ответа validate (Блок 4: OrderSummary в Skeleton). */
export function SummarySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Проверяем состав заказа">
      <div className="flex gap-3">
        <Skeleton className="size-14 shrink-0" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    </div>
  );
}
