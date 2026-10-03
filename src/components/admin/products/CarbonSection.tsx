"use client";

import { Check } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { ProductFormSection } from "@/components/admin/products/ProductFormSection";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { vehicleLabel } from "@/lib/catalog";
import type { ProductFormValues } from "@/lib/admin-products-ui/product-form-values";
import type { AdminVehicleRow } from "@/lib/admin-products-ui/types";
import { cn } from "@/lib/utils";

interface CarbonSectionProps {
  vehicles: readonly AdminVehicleRow[];
  vehiclesStatus: "loading" | "error" | "ready";
  onRetryVehicles: () => void;
}

/** Совместимость карбона: Command-список автомобилей с множественным выбором. */
export function CarbonSection({ vehicles, vehiclesStatus, onRetryVehicles }: CarbonSectionProps) {
  const { control } = useFormContext<ProductFormValues>();
  return (
    <ProductFormSection id="product-fitment" title="Совместимость">
      <FormField
        control={control}
        name="compatible_vehicle_ids"
        render={({ field }) => {
          const selected = new Set(field.value);
          const toggle = (id: string) =>
            field.onChange(selected.has(id) ? field.value.filter((x) => x !== id) : [...field.value, id]);
          return (
            <FormItem>
              <FormLabel>Подходит для автомобилей</FormLabel>
              {vehiclesStatus === "error" ? (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  Справочник автомобилей не загрузился
                  <Button type="button" variant="outline" size="sm" onClick={onRetryVehicles}>Повторить</Button>
                </div>
              ) : (
                <FormControl>
                  <Command className="rounded-md border" data-testid="carbon-vehicles">
                    <CommandInput placeholder="Найти автомобиль" />
                    <CommandList>
                      <CommandEmpty>{vehiclesStatus === "loading" ? "Загрузка…" : "Ничего не найдено"}</CommandEmpty>
                      <CommandGroup>
                        {vehicles.map((v) => (
                          <CommandItem key={v.id} value={`${vehicleLabel(v)} ${v.id}`} onSelect={() => toggle(v.id)}>
                            <Check className={cn("size-4", selected.has(v.id) ? "opacity-100" : "opacity-0")} aria-hidden />
                            <span className="flex-1">{vehicleLabel(v)}</span>
                            {!v.is_active && <span className="text-xs text-muted-foreground">скрыт</span>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </FormControl>
              )}
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Выбрано: {field.value.length}</p>
                {field.value.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange([])}>Сбросить выбор</Button>
                )}
              </div>
              <FormMessage />
            </FormItem>
          );
        }}
      />
    </ProductFormSection>
  );
}
