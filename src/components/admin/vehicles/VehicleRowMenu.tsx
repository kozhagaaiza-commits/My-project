"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { AdminVehicleRow } from "@/lib/admin-products-ui/types";

interface VehicleRowMenuProps {
  vehicle: AdminVehicleRow;
  onEdit: (v: AdminVehicleRow) => void;
  onDelete: (v: AdminVehicleRow) => void;
}

export function VehicleRowMenu({ vehicle, onEdit, onDelete }: VehicleRowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Действия: ${vehicle.make} ${vehicle.model} ${vehicle.generation}`}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(vehicle)}>
          <Pencil aria-hidden />
          Редактировать
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(vehicle)}>
          <Trash2 aria-hidden />
          Удалить
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
