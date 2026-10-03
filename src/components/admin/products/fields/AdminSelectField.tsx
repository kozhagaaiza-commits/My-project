"use client";

import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

interface AdminSelectFieldProps {
  name: string;
  label: string;
  options: readonly SelectOption[];
  placeholder?: string;
  description?: ReactNode;
  mono?: boolean;
  disabled?: boolean;
  className?: string;
  onValueChange?: (value: string) => void;
}

/** Select, привязанный к строковому полю формы; ошибка — inline под полем. */
export function AdminSelectField({
  name, label, options, placeholder = "Выберите", description, mono, disabled, className, onValueChange,
}: AdminSelectFieldProps) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <Select
            value={typeof field.value === "string" ? field.value : ""}
            onValueChange={(v) => {
              field.onChange(v);
              onValueChange?.(v);
            }}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger ref={field.ref} onBlur={field.onBlur} className={cn("w-full scroll-my-24", mono && "font-mono")}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value} className={cn(mono && "font-mono")}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
