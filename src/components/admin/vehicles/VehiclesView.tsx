"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AdminErrorAlert } from "@/components/admin/layout/AdminErrorAlert";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminPagination } from "@/components/admin/layout/AdminPagination";
import { DeleteVehicleDialog } from "@/components/admin/vehicles/DeleteVehicleDialog";
import { VehicleSheet } from "@/components/admin/vehicles/VehicleSheet";
import { VehiclesCardList } from "@/components/admin/vehicles/VehiclesCardList";
import { VehiclesEmpty } from "@/components/admin/vehicles/VehiclesEmpty";
import { VehiclesSkeleton } from "@/components/admin/vehicles/VehiclesSkeleton";
import { VehiclesTable } from "@/components/admin/vehicles/VehiclesTable";
import { VehiclesToolbar } from "@/components/admin/vehicles/VehiclesToolbar";
import { Button } from "@/components/ui/button";
import { useAdminVehicles } from "@/hooks/use-admin-vehicles";
import { useAdminVehiclesFilters } from "@/hooks/use-admin-vehicles-filters";
import type { VehiclesFilters } from "@/lib/admin-products-ui/list-query";
import type { AdminVehicleRow } from "@/lib/admin-products-ui/types";

interface VehiclesViewProps {
  filters: VehiclesFilters;
}

type SheetState = { open: false } | { open: true; vehicle: AdminVehicleRow | null };

/** /admin/vehicles: справочник автомобилей — список, Switch «Активен», Sheet с формой, удаление. */
export function VehiclesView({ filters }: VehiclesViewProps) {
  const nav = useAdminVehiclesFilters(filters);
  const { list, busyId, setActive, remove } = useAdminVehicles(filters);
  const [sheet, setSheet] = useState<SheetState>({ open: false });
  const [toDelete, setToDelete] = useState<AdminVehicleRow | null>(null);

  const rows = list.data ?? [];
  const filtered = filters.make !== null || filters.q.length > 0 || filters.page > 1;
  const emptyDirectory = list.status === "ready" && rows.length === 0 && !filtered;
  const openCreate = () => setSheet({ open: true, vehicle: null });
  const onToggle = (v: AdminVehicleRow, active: boolean) => void setActive(v, active);

  return (
    <>
      <AdminPageHeader
        title="Автомобили"
        actions={
          // Единственная жёлтая кнопка экрана: в пустом справочнике — в Empty, при открытой форме — «Сохранить».
          emptyDirectory || sheet.open ? undefined : (
            <Button type="button" onClick={openCreate}>
              <Plus aria-hidden />
              Добавить авто
            </Button>
          )
        }
      />
      <VehiclesToolbar filters={filters} searchValue={nav.search.value} onSearchChange={nav.search.onChange} onMake={nav.setMake} />
      {list.status === "loading" && <VehiclesSkeleton />}
      {list.status === "error" && (
        <AdminErrorAlert title="Не удалось загрузить справочник" description={list.error?.message} onRetry={list.reload} />
      )}
      {list.status === "ready" && rows.length === 0 && <VehiclesEmpty filtered={filtered} onAdd={openCreate} onReset={nav.reset} />}
      {list.status === "ready" && rows.length > 0 && (
        <div className="space-y-4">
          <VehiclesTable rows={rows} onToggle={onToggle} onEdit={(v) => setSheet({ open: true, vehicle: v })} onDelete={setToDelete} />
          <VehiclesCardList rows={rows} onToggle={onToggle} onEdit={(v) => setSheet({ open: true, vehicle: v })} onDelete={setToDelete} />
          {list.meta && (
            <AdminPagination page={list.meta.page} total={list.meta.total} perPage={list.meta.per_page} hrefFor={nav.hrefFor} />
          )}
        </div>
      )}
      <VehicleSheet
        open={sheet.open}
        vehicle={sheet.open ? sheet.vehicle : null}
        onClose={() => setSheet({ open: false })}
        onSaved={list.reload}
      />
      <DeleteVehicleDialog
        vehicle={toDelete}
        busy={toDelete !== null && busyId === toDelete.id}
        onCancel={() => setToDelete(null)}
        onConfirm={(v) => void remove(v).then(() => setToDelete(null))}
      />
    </>
  );
}
