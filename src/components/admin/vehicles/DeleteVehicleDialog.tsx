"use client";

import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AdminVehicleRow } from "@/lib/admin-products-ui/types";

interface DeleteVehicleDialogProps {
  vehicle: AdminVehicleRow | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (v: AdminVehicleRow) => void;
}

export function DeleteVehicleDialog({ vehicle, busy, onCancel, onConfirm }: DeleteVehicleDialogProps) {
  return (
    <AlertDialog open={vehicle !== null} onOpenChange={(open) => !open && !busy && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Удалить {vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.generation}` : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Ссылки в заказах обнулятся. Чтобы убрать авто из подбора без удаления, выключите «Активен».
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              if (vehicle) onConfirm(vehicle);
            }}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
