"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuantityStepperProps {
  value: number;
  max: number;
  onChange: (value: number) => void;
  min?: number;
  disabled?: boolean;
  /** Что считаем («комплектов», «штук») — для озвучивания скринридером. */
  label?: string;
  size?: "sm" | "default";
  className?: string;
}

export function QuantityStepper({
  value, max, onChange, min = 1, disabled = false, label = "Количество", size = "default", className,
}: QuantityStepperProps) {
  const btn = size === "sm" ? "icon-sm" : "icon";
  return (
    <div role="group" aria-label={label} className={cn("inline-flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size={btn}
        aria-label="Уменьшить количество"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus aria-hidden />
      </Button>
      <output
        aria-live="polite"
        className={cn("min-w-8 text-center font-medium tabular-nums", size === "sm" ? "text-sm" : "text-base")}
      >
        {value}
      </output>
      <Button
        type="button"
        variant="outline"
        size={btn}
        aria-label="Увеличить количество"
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  );
}
