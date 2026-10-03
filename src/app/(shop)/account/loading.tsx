import { Skeleton } from "@/components/ui/skeleton";

// Loading: Skeleton таблицы (5 строк).
export default function AccountLoading() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-6" aria-busy="true" aria-label="Загрузка">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    </div>
  );
}
