"use client";

import { useEffect, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { readCart } from "@/hooks/use-cart";
import { getRequestId, readDraftValues, requestCartKey, writeDraft } from "@/lib/checkout-draft";
import { makeCheckoutResolver, type CheckoutFormValues } from "@/lib/checkout-form";
import type { Cart } from "@/lib/cart-store";
import type { CreateOrderBody } from "@/lib/schemas/orders";

interface Options {
  cart: Cart;
  /** total из последнего ответа validate (копейки); null, пока ответа нет. */
  expectedTotal: number | null;
  vehicleId: string | null;
}

export type CheckoutForm = UseFormReturn<CheckoutFormValues, unknown, CreateOrderBody>;

/**
 * Форма оформления: zodResolver(createOrderBody) поверх значений формы; ошибки — при отправке, затем при изменении
 * поля; первое ошибочное поле получает фокус. Черновик (без согласий) дублируется в sessionStorage при каждом
 * изменении и читается один раз при создании формы (форма монтируется только после гидратации).
 */
export function useCheckoutForm({ cart, expectedTotal, vehicleId }: Options): CheckoutForm {
  const [defaultValues] = useState(readDraftValues);
  const form = useForm<CheckoutFormValues, unknown, CreateOrderBody>({
    defaultValues,
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: true,
    resolver: makeCheckoutResolver(() => ({
      // Состав берём из хранилища на момент проверки: правки корзины из другой вкладки не должны потеряться.
      requestId: getRequestId(requestCartKey(readCart().items)),
      items: cart.items,
      expectedTotal,
      vehicleId,
    })),
  });

  const { subscribe } = form;
  useEffect(
    () => subscribe({ formState: { values: true }, callback: ({ values }) => writeDraft(values) }),
    [subscribe],
  );

  return form;
}
