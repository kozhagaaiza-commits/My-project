import { Skeleton } from "@/components/ui/skeleton";

/** Loading: 5 строк. */
export function AteliersSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загрузка заявок" className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-lg lg:h-14" />
      ))}
    </div>
  );
}
