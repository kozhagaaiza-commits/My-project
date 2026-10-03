import { ProductsSkeleton } from "@/components/admin/products/ProductsSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminProductsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-9 w-full max-w-md" />
      <ProductsSkeleton />
    </div>
  );
}
