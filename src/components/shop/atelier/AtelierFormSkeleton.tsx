import { Skeleton } from "@/components/ui/skeleton";

/** Loading: Skeleton формы (7 полей). */
export function AtelierFormSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загрузка" className="flex flex-col gap-4">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-full md:h-9" />
        </div>
      ))}
      <Skeleton className="h-11 w-full sm:w-44 md:h-9" />
    </div>
  );
}
