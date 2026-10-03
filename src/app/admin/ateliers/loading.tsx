import { AteliersSkeleton } from "@/components/admin/ateliers/AteliersSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminAteliersLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-9 w-full max-w-md" />
      <AteliersSkeleton />
    </div>
  );
}
