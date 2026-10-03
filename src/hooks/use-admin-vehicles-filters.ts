"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDebouncedSearch } from "@/hooks/use-admin-products-search";
import { vehiclesPageHref, type VehicleMake, type VehiclesFilters } from "@/lib/admin-products-ui/list-query";

/** Фильтры списка автомобилей (марка, поиск по модели, страница) — в URL, router.replace без скролла. */
export function useAdminVehiclesFilters(filters: VehiclesFilters) {
  const router = useRouter();
  const go = useCallback(
    (next: VehiclesFilters) => router.replace(vehiclesPageHref(next), { scroll: false }),
    [router],
  );
  const search = useDebouncedSearch(filters.q, (q) => go({ ...filters, q, page: 1 }));

  return {
    search,
    setMake: (make: VehicleMake | null) => go({ ...filters, make, page: 1 }),
    reset: () => {
      search.clear();
      go({ make: null, q: "", page: 1 });
    },
    hrefFor: (page: number) => vehiclesPageHref({ ...filters, page }),
  };
}
