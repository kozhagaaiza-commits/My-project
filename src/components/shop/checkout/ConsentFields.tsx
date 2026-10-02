"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useFormContext } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { CheckoutFormValues } from "@/lib/checkout-form";

function ConsentLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" className="text-silver underline underline-offset-4 hover:text-foreground">
      {children}
    </Link>
  );
}

interface ConsentCheckboxProps {
  name: "consent_pd" | "consent_offer";
  children: ReactNode;
}

function ConsentCheckbox({ name, children }: ConsentCheckboxProps) {
  const { control } = useFormContext<CheckoutFormValues>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <div className="flex items-start gap-3">
            <FormControl>
              <Checkbox
                ref={field.ref}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                onBlur={field.onBlur}
                className="mt-0.5 scroll-my-24"
              />
            </FormControl>
            <FormLabel className="text-sm leading-snug font-normal">{children}</FormLabel>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Два обязательных согласия (BR/US-003): ПДн с Политикой и публичная оферта — ссылки в новой вкладке. */
export function ConsentFields() {
  return (
    <div className="flex flex-col gap-4">
      <ConsentCheckbox name="consent_pd">
        <span>
          Даю согласие на обработку персональных данных согласно <ConsentLink href="/privacy">Политике</ConsentLink>
        </span>
      </ConsentCheckbox>
      <ConsentCheckbox name="consent_offer">
        <span>
          Принимаю условия <ConsentLink href="/offer">публичной оферты</ConsentLink>
        </span>
      </ConsentCheckbox>
    </div>
  );
}
