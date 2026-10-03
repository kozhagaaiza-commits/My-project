"use client";

import { CircleHelp } from "lucide-react";
import { useWatch, type Control } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { fittingVehicles, vehicleShortName } from "@/lib/admin-products-ui/fitment-preview";
import type { ProductFormValues } from "@/lib/admin-products-ui/product-form-values";
import type { AdminVehicleRow } from "@/lib/admin-products-ui/types";

interface WheelFitListProps {
  control: Control<ProductFormValues>;
  vehicles: readonly AdminVehicleRow[];
  vehiclesStatus: "loading" | "error" | "ready";
  onRetry: () => void;
}

/** «Подходит для: BMW 3 Series G20, …» — клиентский расчёт по справочнику (те же правила, что find_wheels_for_vehicle). */
export function WheelFitList({ control, vehicles, vehiclesStatus, onRetry }: WheelFitListProps) {
  const values = useWatch({ control });
  const fit = vehiclesStatus === "ready" ? fittingVehicles(values as ProductFormValues, vehicles) : null;

  let text: string;
  if (vehiclesStatus === "loading") text = "Справочник автомобилей загружается…";
  else if (vehiclesStatus === "error") text = "Справочник автомобилей не загрузился";
  else if (fit === null) text = "Заполните диаметр, ширину, вылет, PCD, ЦО и посадку, чтобы увидеть список";
  else if (fit.length === 0) text = "Подходит для: нет автомобилей в справочнике";
  else text = `Подходит для: ${fit.map(vehicleShortName).join(", ")}`;

  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-sm" data-testid="wheel-fit-list" aria-live="polite">
      <CircleHelp className="mt-0.5 size-4 shrink-0 text-silver" aria-hidden />
      <p className="min-w-0 flex-1 text-muted-foreground">
        {fit && fit.length > 0 ? <span className="text-foreground">{text}</span> : text}
      </p>
      {vehiclesStatus === "error" && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>Повторить</Button>
      )}
    </div>
  );
}
