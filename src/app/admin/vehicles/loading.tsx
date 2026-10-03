import { VehiclesSkeleton } from "@/components/admin/vehicles/VehiclesSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminVehiclesLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-9 w-full max-w-md" />
      <VehiclesSkeleton />
    </div>
  );
}
