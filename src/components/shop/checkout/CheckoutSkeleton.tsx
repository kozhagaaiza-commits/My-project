import { Skeleton } from "@/components/ui/skeleton";

/** До гидратации и пока идёт redirect: каркас формы и «Состава заказа». */
export function CheckoutSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[7fr_5fr] lg:items-start lg:gap-8" aria-busy="true" aria-label="Загрузка оформления заказа">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="mt-4 h-6 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <Skeleton className="hidden h-72 w-full md:block" />
    </div>
  );
}
