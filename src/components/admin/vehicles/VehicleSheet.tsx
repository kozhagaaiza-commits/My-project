"use client";

import { Loader2 } from "lucide-react";
import { VehicleFormFields } from "@/components/admin/vehicles/VehicleFormFields";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAdminVehicleForm } from "@/hooks/use-admin-vehicle-form";
import type { AdminVehicleRow } from "@/lib/admin-products-ui/types";

interface VehicleSheetProps {
  open: boolean;
  /** null — создание. */
  vehicle: AdminVehicleRow | null;
  onClose: () => void;
  /** После успешного сохранения (и после 404): обновить список. */
  onSaved: () => void;
}

function VehicleSheetForm({ vehicle, onClose, onSaved }: Omit<VehicleSheetProps, "open">) {
  const { form, submit } = useAdminVehicleForm({
    vehicle,
    onDone: () => {
      onSaved();
      onClose();
    },
  });
  const busy = form.formState.isSubmitting;
  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <VehicleFormFields />
        </div>
        <SheetFooter className="flex-row justify-end border-t">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Отмена</Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Сохранить
          </Button>
        </SheetFooter>
      </form>
    </Form>
  );
}

/** Создание и редактирование автомобиля — Sheet справа (на mobile на всю ширину) с формой vehicleUpsertBody. */
export function VehicleSheet({ open, vehicle, onClose, onSaved }: VehicleSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{vehicle ? "Редактировать авто" : "Добавить авто"}</SheetTitle>
          <SheetDescription>Диапазоны — допустимые размеры без доработок кузова и подвески</SheetDescription>
        </SheetHeader>
        <VehicleSheetForm key={vehicle?.id ?? "new"} vehicle={vehicle} onClose={onClose} onSaved={onSaved} />
      </SheetContent>
    </Sheet>
  );
}
