import { Skeleton } from "@/components/ui/skeleton";

/** Loading формы товара: заголовок, четыре блока полей, колонка превью (desktop). */
export function ProductFormSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Загрузка формы" data-testid="product-form-skeleton">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-4 rounded-xl border bg-card p-4 md:p-6">
              <Skeleton className="h-5 w-40" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="hidden h-96 lg:col-span-4 lg:block" />
      </div>
    </div>
  );
}
