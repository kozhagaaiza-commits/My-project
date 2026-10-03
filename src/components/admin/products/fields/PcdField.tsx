"use client";

import { useFormContext } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PCD_OTHER, PCD_PRESETS } from "@/lib/admin-products-ui/labels";

interface PcdFieldProps {
  /** «wheel.pcd» для товара, «pcd» для автомобиля; флаг «Другое» хранится рядом: «<name>_other» в том же объекте. */
  name: string;
  otherName: string;
  className?: string;
}

/** PCD: Select из 5x112, 5x120, 5x130, 5x108, 5x114.3 + «Другое» (ручной ввод). */
export function PcdField({ name, otherName, className }: PcdFieldProps) {
  const { control, setValue, watch } = useFormContext();
  const other = watch(otherName) === true;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>PCD</FormLabel>
          <Select
            value={other ? PCD_OTHER : typeof field.value === "string" ? field.value : ""}
            onValueChange={(v) => {
              if (v === PCD_OTHER) {
                setValue(otherName, true, { shouldDirty: true });
                setValue(name, "", { shouldDirty: true });
              } else {
                setValue(otherName, false, { shouldDirty: true });
                field.onChange(v);
              }
            }}
          >
            <FormControl>
              <SelectTrigger ref={field.ref} className="w-full font-mono">
                <SelectValue placeholder="Выберите" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {PCD_PRESETS.map((p) => (
                <SelectItem key={p} value={p} className="font-mono">{p}</SelectItem>
              ))}
              <SelectItem value={PCD_OTHER}>Другое</SelectItem>
            </SelectContent>
          </Select>
          {other && (
            <Input
              value={typeof field.value === "string" ? field.value : ""}
              onChange={(e) => field.onChange(e.target.value)}
              placeholder="5x100"
              aria-label="PCD, другое значение"
              className="font-mono"
            />
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
