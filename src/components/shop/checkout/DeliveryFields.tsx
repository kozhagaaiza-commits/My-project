"use client";

import { ExternalLink } from "lucide-react";
import { CheckoutTextField } from "@/components/shop/checkout/CheckoutTextField";
import { applyPostalMask, applyUpperMask } from "@/lib/checkout-mask";
import type { DeliveryMethod } from "@/lib/checkout-form";
import { COURIER_CITY } from "@/lib/checkout-form";

const CDEK_MAP_URL = "https://www.cdek.ru/ru/offices";

interface DeliveryFieldsProps {
  method: DeliveryMethod;
}

/** Поля выбранного способа доставки (Блок 4): курьер — адрес и индекс; ПВЗ — город и код; до двери — город, адрес, индекс. */
export function DeliveryFields({ method }: DeliveryFieldsProps) {
  const postal = (optional: boolean) => (
    <CheckoutTextField
      name="delivery.postal_code"
      label="Индекс"
      inputMode="numeric"
      autoComplete="postal-code"
      placeholder="123456"
      className="font-mono tabular-nums"
      description={optional ? "Необязательно" : undefined}
      transform={applyPostalMask}
    />
  );

  if (method === "moscow_courier") {
    return (
      <>
        <p className="text-sm text-muted-foreground sm:col-span-2">
          Город: <span className="text-foreground">{COURIER_CITY}</span>
        </p>
        <div className="sm:col-span-2">
          <CheckoutTextField
            name="delivery.address"
            label="Адрес (улица, дом, квартира)"
            autoComplete="street-address"
            maxLength={300}
          />
        </div>
        {postal(true)}
      </>
    );
  }

  if (method === "cdek_pvz") {
    return (
      <>
        <CheckoutTextField name="delivery.city" label="Город" autoComplete="address-level2" maxLength={80} />
        <CheckoutTextField
          name="delivery.cdek_pvz_code"
          label="Код пункта выдачи СДЭК"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={20}
          placeholder="KZN45"
          className="font-mono uppercase"
          transform={applyUpperMask}
          description={
            <a
              href={CDEK_MAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-silver underline-offset-4 hover:underline focus-visible:underline"
            >
              Найти пункт на карте СДЭК
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="sm:col-span-2">
        <CheckoutTextField name="delivery.city" label="Город" autoComplete="address-level2" maxLength={80} />
      </div>
      <div className="sm:col-span-2">
        <CheckoutTextField name="delivery.address" label="Адрес" autoComplete="street-address" maxLength={300} />
      </div>
      {postal(false)}
    </>
  );
}
