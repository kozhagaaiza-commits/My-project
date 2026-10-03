"use client";

import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface AdminCheckboxFieldProps {
  name: string;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export function AdminCheckboxField({ name, label, description, disabled, onCheckedChange }: AdminCheckboxFieldProps) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <div className="flex items-start gap-2">
            <FormControl>
              <Checkbox
                ref={field.ref}
                checked={field.value === true}
                disabled={disabled}
                onBlur={field.onBlur}
                onCheckedChange={(c) => {
                  field.onChange(c === true);
                  onCheckedChange?.(c === true);
                }}
                className="mt-0.5"
              />
            </FormControl>
            <div className="space-y-1">
              <FormLabel className="font-normal">{label}</FormLabel>
              {description && <FormDescription>{description}</FormDescription>}
            </div>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
