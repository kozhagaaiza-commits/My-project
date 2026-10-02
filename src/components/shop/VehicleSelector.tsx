"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { VehicleSelectField } from "@/components/shop/VehicleSelectField";
import { Button } from "@/components/ui/button";
import { useVehicleSelection } from "@/hooks/use-vehicle-selection";
import { writeStoredVehicle } from "@/hooks/use-stored-vehicle";
import { reachGoal } from "@/lib/analytics";
import { cn } from "@/lib/utils";

interface VehicleSelectorProps {
  mode: "hero" | "compact";
  /** Куда вести после выбора (по умолчанию каталог дисков). */
  targetPath?: string;
  submitLabel?: string;
  /** Вызывается после перехода (например, закрыть Sheet). */
  onSubmitted?: () => void;
  idPrefix?: string;
}

export function VehicleSelector({
  mode, targetPath = "/wheels", submitLabel = "Показать диски", onSubmitted, idPrefix = "vs",
}: VehicleSelectorProps) {
  const router = useRouter();
  const s = useVehicleSelection();
  const hero = mode === "hero";

  const submit = () => {
    if (!s.vehicle) return;
    writeStoredVehicle({ id: s.vehicle.id, label: s.vehicle.label });
    reachGoal("fitment_selected");
    router.push(`${targetPath}?vehicle=${encodeURIComponent(s.vehicle.id)}`);
    onSubmitted?.();
  };

  const common = { large: hero, className: hero ? "lg:flex-1" : undefined };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn("flex flex-col gap-3", hero && "md:grid md:grid-cols-2 lg:flex lg:flex-row lg:items-end")}
    >
      <VehicleSelectField
        {...common}
        id={`${idPrefix}-make`}
        label="Марка"
        placeholder="Выберите марку"
        value={s.selection.make}
        options={s.makes.items.map((m) => ({ value: m, label: m }))}
        status={s.makes.status}
        errorText="Не удалось загрузить марки."
        onChange={s.setMake}
        onRetry={s.makes.retry}
      />
      <VehicleSelectField
        {...common}
        id={`${idPrefix}-model`}
        label="Модель"
        placeholder="Выберите модель"
        value={s.selection.model}
        options={s.models.items.map((m) => ({ value: m, label: m }))}
        status={s.models.status}
        errorText="Не удалось загрузить модели."
        onChange={s.setModel}
        onRetry={s.models.retry}
      />
      <VehicleSelectField
        {...common}
        id={`${idPrefix}-year`}
        label="Год"
        placeholder="Выберите год"
        value={s.selection.year}
        options={s.years.items.map((y) => ({ value: String(y), label: String(y) }))}
        status={s.years.status}
        errorText="Не удалось загрузить годы."
        onChange={s.setYear}
        onRetry={s.years.retry}
      />
      {(s.needsGeneration || s.generations.status === "error") && (
        <VehicleSelectField
          {...common}
          id={`${idPrefix}-generation`}
          label="Поколение"
          placeholder="Выберите поколение"
          value={s.selection.generationId}
          options={s.generations.items.map((g) => ({
            value: g.id,
            label: `${g.generation} (${g.year_from}–${g.year_to ?? "н.в."})`,
          }))}
          status={s.generations.status}
          errorText="Не удалось определить поколение."
          onChange={s.setGeneration}
          onRetry={s.generations.retry}
        />
      )}
      <div className={cn("max-md:sticky max-md:bottom-3 max-md:z-10", hero && "md:col-span-2 lg:col-span-1")}>
        <Button
          type="submit"
          size={hero ? "lg" : "default"}
          disabled={!s.vehicle}
          className={cn("w-full", hero ? "h-12 lg:w-auto" : "h-10")}
        >
          {submitLabel}
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </form>
  );
}
