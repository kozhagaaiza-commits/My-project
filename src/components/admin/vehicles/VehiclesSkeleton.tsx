import { Skeleton } from "@/components/ui/skeleton";

/** Loading списка автомобилей: 10 строк. */
export function VehiclesSkeleton() {
  return (
    <div role="status" aria-label="Загрузка справочника" data-testid="vehicles-skeleton">
      <div className="hidden space-y-2 md:block">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
