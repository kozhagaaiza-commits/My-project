"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AdminTextFieldProps extends Omit<ComponentProps<typeof Input>, "name" | "value" | "onChange" | "defaultValue"> {
  /** Путь поля формы («wheel.pcd»). */
  name: string;
  label: string;
  description?: ReactNode;
  /** Моноширинный шрифт: SKU, ET, ЦО, суммы. */
  mono?: boolean;
  /** Дополнительная реакция на ввод (например, пересчёт slug). */
  onValueChange?: (value: string) => void;
  /** Справа от поля (кнопка RefreshCw у slug). */
  adornment?: ReactNode;
}

/** Label + Input + пояснение + inline-ошибка под полем (FormMessage). */
export function AdminTextField({ name, label, description, mono, onValueChange, adornment, className, ...input }: AdminTextFieldProps) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <div className="flex items-center gap-2">
            <FormControl>
              <Input
                {...input}
                {...field}
                value={typeof field.value === "string" ? field.value : ""}
                onChange={(e) => {
                  field.onChange(e.target.value);
                  onValueChange?.(e.target.value);
                }}
                className={cn("scroll-my-24", mono && "font-mono tabular-nums")}
              />
            </FormControl>
            {adornment}
          </div>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
