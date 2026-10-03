"use client";

import { useFormContext } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { COMMENT_MAX, type CheckoutFormValues } from "@/lib/checkout-form";
import { cn } from "@/lib/utils";

/** «Комментарий к заказу» (до 1000 символов, счётчик). Лимит не обрезает ввод — превышение показывает ошибка схемы. */
export function CommentField() {
  const { control } = useFormContext<CheckoutFormValues>();
  return (
    <FormField
      control={control}
      name="comment"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Комментарий к заказу</FormLabel>
          <FormControl>
            <Textarea {...field} rows={3} className="scroll-my-24 min-h-20" />
          </FormControl>
          <div className="flex items-start justify-between gap-3">
            <FormMessage />
            <p
              className={cn(
                "ml-auto font-mono text-xs text-muted-foreground tabular-nums",
                field.value.length > COMMENT_MAX && "text-destructive",
              )}
              aria-live="polite"
            >
              {field.value.length} / {COMMENT_MAX}
            </p>
          </div>
        </FormItem>
      )}
    />
  );
}
