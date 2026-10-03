"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { CheckoutFormValues } from "@/lib/checkout-form";
import { cn } from "@/lib/utils";

export type TextFieldName =
  | "customer.name" | "customer.phone" | "customer.email"
  | "delivery.city" | "delivery.address" | "delivery.postal_code" | "delivery.cdek_pvz_code"
  | "vin";

interface CheckoutTextFieldProps extends Omit<ComponentProps<typeof Input>, "name" | "value" | "onChange"> {
  name: TextFieldName;
  label: string;
  description?: ReactNode;
  /** Маска/нормализация ввода: (новое значение, прежнее значение) → значение формы. */
  transform?: (raw: string, prev: string) => string;
}

/** Текстовое поле формы: Label + Input + пояснение + сообщение об ошибке inline (FormMessage). */
export function CheckoutTextField({ name, label, description, transform, className, ...inputProps }: CheckoutTextFieldProps) {
  const { control } = useFormContext<CheckoutFormValues>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...inputProps}
              {...field}
              onChange={(e) => field.onChange(transform ? transform(e.target.value, field.value) : e.target.value)}
              className={cn("scroll-my-24", className)}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
