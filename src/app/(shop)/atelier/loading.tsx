import { AtelierFormSkeleton } from "@/components/shop/atelier/AtelierFormSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function AtelierLoading() {
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 md:px-6 md:py-12 lg:grid-cols-12 lg:gap-12">
      <div className="flex flex-col gap-4 lg:col-span-5">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-6 w-60" />
        <Skeleton className="h-6 w-80 max-w-full" />
      </div>
      <div className="lg:col-span-7">
        <AtelierFormSkeleton />
      </div>
    </div>
  );
}
