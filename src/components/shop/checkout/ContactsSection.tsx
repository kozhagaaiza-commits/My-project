"use client";

import { CheckoutSection } from "@/components/shop/checkout/CheckoutSection";
import { CheckoutTextField } from "@/components/shop/checkout/CheckoutTextField";
import { applyPhoneMask } from "@/lib/checkout-mask";

/** «Контакты»: имя, телефон (маска +7 (999) 999-99-99), email. */
export function ContactsSection() {
  return (
    <CheckoutSection title="Контакты">
      <div className="grid items-start gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <CheckoutTextField name="customer.name" label="Имя и фамилия" autoComplete="name" maxLength={100} />
        </div>
        <CheckoutTextField
          name="customer.phone"
          label="Телефон"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+7 (999) 999-99-99"
          transform={applyPhoneMask}
        />
        <CheckoutTextField
          name="customer.email"
          label="Email"
          type="email"
          autoComplete="email"
          description="Пришлём ссылку на заказ"
        />
      </div>
    </CheckoutSection>
  );
}
