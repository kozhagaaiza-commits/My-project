"use client";

import type { FormEventHandler } from "react";
import { CommentField } from "@/components/shop/checkout/CommentField";
import { ConsentFields } from "@/components/shop/checkout/ConsentFields";
import { ContactsSection } from "@/components/shop/checkout/ContactsSection";
import { DeliverySection } from "@/components/shop/checkout/DeliverySection";
import { VehicleSection } from "@/components/shop/checkout/VehicleSection";
import type { StoredVehicle } from "@/hooks/use-stored-vehicle";

export const CHECKOUT_FORM_ID = "checkout-form";

interface CheckoutFormProps {
  onSubmit: FormEventHandler<HTMLFormElement>;
  submitting: boolean;
  vehicle: StoredVehicle | null;
}

/**
 * Одна форма оформления. Кнопки оплаты лежат вне <form> и привязаны через атрибут form (CHECKOUT_FORM_ID).
 * При отправке вся форма disabled (fieldset): значения уже считаны, повторный ввод и клик невозможны.
 */
export function CheckoutForm({ onSubmit, submitting, vehicle }: CheckoutFormProps) {
  return (
    <form id={CHECKOUT_FORM_ID} onSubmit={onSubmit} noValidate aria-busy={submitting}>
      <fieldset disabled={submitting} className="flex min-w-0 flex-col gap-8">
        <ContactsSection />
        <DeliverySection />
        <VehicleSection vehicle={vehicle} />
        <CommentField />
        <ConsentFields />
      </fieldset>
    </form>
  );
}
