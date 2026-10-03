import { VehiclesView } from "@/components/admin/vehicles/VehiclesView";
import { parseVehiclesFilters } from "@/lib/admin-products-ui/list-query";

export default async function AdminVehiclesPage({ searchParams }: PageProps<"/admin/vehicles">) {
  return <VehiclesView filters={parseVehiclesFilters(await searchParams)} />;
}
