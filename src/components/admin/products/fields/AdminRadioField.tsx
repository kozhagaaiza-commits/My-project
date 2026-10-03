"use client";

import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface AdminRadioFieldProps {
  name: string;
  label: string;
  options: readonly RadioOption[];
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
  onValueChange?: (value: string) => void;
}

/** RadioGroup из карточек-переключателей, привязанный к строковому полю формы. */
export function AdminRadioField({ name, label, options, description, disabled, className, onValueChange }: AdminRadioFieldProps) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <RadioGroup
              ref={field.ref}
              value={typeof field.value === "string" ? field.value : ""}
              onValueChange={(v) => {
                field.onChange(v);
                onValueChange?.(v);
              }}
              disabled={disabled}
              className="grid gap-2 sm:grid-cols-2"
            >
              {options.map((o) => {
                const id = `${name}-${o.value}`;
                return (
                  <Label
                    key={o.value}
                    htmlFor={id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2.5 font-normal has-[[data-state=checked]]:border-silver",
                      (disabled || o.disabled) && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <RadioGroupItem id={id} value={o.value} disabled={disabled || o.disabled} />
                    {o.label}
                  </Label>
                );
              })}
            </RadioGroup>
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
