"use client";

import type { LucideIcon } from "lucide-react";
import { House, Package, Truck } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { CheckoutSection } from "@/components/shop/checkout/CheckoutSection";
import { DeliveryFields } from "@/components/shop/checkout/DeliveryFields";
import { Card } from "@/components/ui/card";
import { FormField, FormItem, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { plural } from "@/lib/cart-store";
import { DELIVERY_METHODS, type CheckoutFormValues, type DeliveryMethod } from "@/lib/checkout-form";
import { MOSCOW_DELIVERY_DAYS, REGION_DELIVERY_DAYS } from "@/lib/config";
import { cn } from "@/lib/utils";

const days = (r: { min: number; max: number }) => `${r.min}–${r.max} ${plural(r.max, ["день", "дня", "дней"])}`;

interface Option {
  title: string;
  term: string;
  Icon: LucideIcon;
}

// «Курьер по Москве · 1–2 дня · бесплатно» и т.д. (Блок 4; доставка бесплатна для всех способов, BR-11).
const OPTIONS: Record<DeliveryMethod, Option> = {
  moscow_courier: { title: "Курьер по Москве", term: `${days(MOSCOW_DELIVERY_DAYS)} · бесплатно`, Icon: Truck },
  cdek_pvz: { title: "СДЭК — пункт выдачи", term: `${days(REGION_DELIVERY_DAYS)} · бесплатно`, Icon: Package },
  cdek_door: { title: "СДЭК — до двери", term: `${days(REGION_DELIVERY_DAYS)} · бесплатно`, Icon: House },
};

/** «Доставка»: RadioGroup из трёх Card-вариантов, поля выбранного способа раскрываются внутри карточки. */
export function DeliverySection() {
  const { control } = useFormContext<CheckoutFormValues>();
  return (
    <CheckoutSection title="Доставка">
      <FormField
        control={control}
        name="delivery.method"
        render={({ field }) => (
          <FormItem>
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              aria-label="Способ доставки"
              aria-required
            >
              {DELIVERY_METHODS.map((method, index) => {
                const { title, term, Icon } = OPTIONS[method];
                const selected = field.value === method;
                return (
                  <Card
                    key={method}
                    className={cn("gap-0 py-0 transition-colors", selected ? "border-silver" : "hover:border-silver/50")}
                  >
                    <label htmlFor={`delivery-${method}`} className="flex cursor-pointer items-center gap-3 p-4">
                      <RadioGroupItem
                        id={`delivery-${method}`}
                        value={method}
                        ref={index === 0 ? field.ref : undefined}
                        className="scroll-my-24"
                      />
                      <Icon className="size-5 shrink-0 text-silver" aria-hidden />
                      <span className="text-sm font-medium">
                        {title}
                        <span className="font-normal text-muted-foreground"> · {term}</span>
                      </span>
                    </label>
                    {selected && (
                      <div className="grid items-start gap-4 border-t border-border p-4 sm:grid-cols-2">
                        <DeliveryFields method={method} />
                      </div>
                    )}
                  </Card>
                );
              })}
            </RadioGroup>
            <FormMessage />
          </FormItem>
        )}
      />
    </CheckoutSection>
  );
}
