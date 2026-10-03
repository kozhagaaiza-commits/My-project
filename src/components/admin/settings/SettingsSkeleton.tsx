import { Skeleton } from "@/components/ui/skeleton";

/** Loading: Skeleton трёх карточек. */
export function SettingsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Загрузка настроек">
      <Skeleton className="h-44 rounded-xl" />
      <Skeleton className="h-80 rounded-xl lg:row-span-2" />
      <Skeleton className="h-44 rounded-xl" />
    </div>
  );
}
