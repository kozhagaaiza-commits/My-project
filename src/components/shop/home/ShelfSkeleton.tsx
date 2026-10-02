import { Skeleton } from "@/components/ui/skeleton";

/** Loading витрины: 4 карточки (aspect-square + 2 строки). */
export function ShelfSkeleton() {
  return (
    <section aria-hidden className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
      <Skeleton className="mb-5 h-7 w-48" />
      <div className="flex gap-3 overflow-hidden md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="w-[75vw] max-w-72 shrink-0 space-y-3 md:w-auto md:max-w-none">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/5" />
          </div>
        ))}
      </div>
    </section>
  );
}
