"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAdminFetch } from "@/hooks/use-admin-products-fetch";
import { adminRequest, errorText } from "@/lib/admin-products-ui/api";
import { vehiclesApiUrl, type VehiclesFilters } from "@/lib/admin-products-ui/list-query";
import type { AdminVehicleRow } from "@/lib/admin-products-ui/types";

/** Список автомобилей + Switch «Активен» (optimistic, откат при ошибке) и удаление. */
export function useAdminVehicles(filters: VehiclesFilters) {
  const list = useAdminFetch<AdminVehicleRow[]>(vehiclesApiUrl(filters));
  const [busyId, setBusyId] = useState<string | null>(null);
  const { mutate, reload } = list;

  const setActive = useCallback(
    async (row: AdminVehicleRow, next: boolean) => {
      const patch = (active: boolean) => (rows: AdminVehicleRow[]) =>
        rows.map((x) => (x.id === row.id ? { ...x, is_active: active } : x));
      mutate(patch(next));
      const r = await adminRequest("PATCH", `/api/admin/vehicles/${row.id}`, { is_active: next });
      if (!r.ok) {
        mutate(patch(row.is_active));
        toast.error(errorText(r));
      }
    },
    [mutate],
  );

  const remove = useCallback(
    async (row: AdminVehicleRow): Promise<boolean> => {
      setBusyId(row.id);
      const r = await adminRequest("DELETE", `/api/admin/vehicles/${row.id}`);
      setBusyId(null);
      if (!r.ok) {
        toast.error(errorText(r));
        if (r.kind === "http" && r.status === 404) reload();
        return false;
      }
      toast.success(`${row.make} ${row.model} ${row.generation} удалён`);
      reload();
      return true;
    },
    [reload],
  );

  return { list, busyId, setActive, remove };
}
