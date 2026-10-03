"use client";

import { useState } from "react";
import { Car } from "lucide-react";
import { CheckoutSection } from "@/components/shop/checkout/CheckoutSection";
import { CheckoutTextField } from "@/components/shop/checkout/CheckoutTextField";
import { VehicleSelector } from "@/components/shop/VehicleSelector";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { StoredVehicle } from "@/hooks/use-stored-vehicle";
import { applyUpperMask } from "@/lib/checkout-mask";

interface VehicleSectionProps {
  /** Авто из localStorage.fc_vehicle (null — не выбрано). Его id уходит в заказ как vehicle_id. */
  vehicle: StoredVehicle | null;
}

/** «Автомобиль»: выбранное авто с кнопкой «Изменить» (Sheet, как в каталоге) + VIN. */
export function VehicleSection({ vehicle }: VehicleSectionProps) {
  const [open, setOpen] = useState(false);
  return (
    <CheckoutSection title="Автомобиль">
      {vehicle && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <p className="flex min-w-0 items-center gap-2 text-sm">
            <Car className="size-4 shrink-0 text-silver" aria-hidden />
            <span className="truncate" title={vehicle.label}>{vehicle.label}</span>
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            Изменить
          </Button>
        </div>
      )}
      <div className="md:max-w-sm">
        <CheckoutTextField
          name="vin"
          label="VIN (необязательно)"
          description="Инженер сверит совместимость"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={17}
          placeholder="WBAJA11050B123456"
          className="font-mono uppercase"
          transform={applyUpperMask}
        />
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Изменить авто</SheetTitle>
            <SheetDescription>Марка, модель и год</SheetDescription>
          </SheetHeader>
          {/* submit формы подбора всплывает по дереву React через портал — не даём ему отправить заказ. */}
          <div className="px-4 pb-4" onSubmit={(e) => e.stopPropagation()}>
            <VehicleSelector
              mode="compact"
              idPrefix="co"
              targetPath="/checkout"
              submitLabel="Выбрать"
              onSubmitted={() => setOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </CheckoutSection>
  );
}
