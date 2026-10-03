"use client";

import type { ComponentProps, ReactNode } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

interface AuthFieldProps<T extends FieldValues> extends Omit<ComponentProps<typeof Input>, "name" | "value" | "onChange" | "defaultValue"> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: ReactNode;
  /** Маска ввода: (новое значение, прежнее значение) → значение формы. */
  transform?: (raw: string, prev: string) => string;
  /** Элемент поверх правого края поля (кнопка показа пароля). */
  adornment?: ReactNode;
}

/** Поле формы: Label + Input + пояснение + сообщение об ошибке inline (FormMessage). */
export function AuthField<T extends FieldValues>({ control, name, label, description, transform, adornment, ...inputProps }: AuthFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <div className="relative">
            <FormControl>
              <Input
                {...inputProps}
                {...field}
                value={typeof field.value === "string" ? field.value : ""}
                onChange={(e) => field.onChange(transform ? transform(e.target.value, String(field.value ?? "")) : e.target.value)}
                className={adornment ? "scroll-my-24 pr-10" : "scroll-my-24"}
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
