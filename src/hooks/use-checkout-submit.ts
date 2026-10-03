"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { UseFormSetError, UseFormSetFocus } from "react-hook-form";
import { toast } from "sonner";
import { clearCart } from "@/hooks/use-cart";
import { validateCart } from "@/lib/cart-api";
import { clearDraft, clearRequestId } from "@/lib/checkout-draft";
import type { CheckoutFieldName, CheckoutFormValues } from "@/lib/checkout-form";
import { GENERIC_ERROR_MESSAGE, resolveCreateOrderResult } from "@/lib/checkout-response";
import { createOrder } from "@/lib/orders-api";
import type { PaymentErrorInfo } from "@/components/shop/checkout/PaymentErrorDialog";
import type { PriceChange } from "@/components/shop/checkout/PriceChangedDialog";
import type { CreateOrderBody } from "@/lib/schemas/orders";

interface Options {
  setError: UseFormSetError<CheckoutFormValues>;
  setFocus: UseFormSetFocus<CheckoutFormValues>;
  /** Перечитать цены (validate) после PRICE_CHANGED, чтобы «Состав заказа» показал новый итог. */
  refreshPrices: () => void;
  /** Цены ателье были в ответе validate (для распознавания истёкшей сессии, Edge Case 20). */
  atelierPrices: boolean;
  /** Вызывается ДО очистки корзины / ухода со страницы: пустая корзина не должна вызвать redirect('/cart'). */
  onLeave: () => void;
  onPaymentError: (info: PaymentErrorInfo) => void;
}

export interface CheckoutSubmit {
  submitting: boolean;
  priceChange: PriceChange | null;
  send: (body: CreateOrderBody) => Promise<void>;
  /** «Продолжить» в диалоге цены: повтор с expected_total = actual_total и тем же client_request_id. */
  continueWithNewPrice: () => void;
  closePriceChange: () => void;
}

/** Заказ создан: корзина, черновик и id попытки больше не нужны. */
function finishOrder(): void {
  clearCart();
  clearDraft();
  clearRequestId();
}

/** Отправка POST /api/orders и реакции интерфейса на все ответы Блока 3 (Блок 4 «Оформление заказа» → Error). */
export function useCheckoutSubmit({ setError, setFocus, refreshPrices, atelierPrices, onLeave, onPaymentError }: Options): CheckoutSubmit {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<{ change: PriceChange; body: CreateOrderBody } | null>(null);
  const inFlight = useRef(false);
  const focusAfterEnable = useRef<CheckoutFieldName | null>(null);

  // Форма на время запроса disabled — фокус на первое поле с ошибкой сервера ставим, когда она снова доступна.
  useEffect(() => {
    if (submitting || !focusAfterEnable.current) return;
    setFocus(focusAfterEnable.current);
    focusAfterEnable.current = null;
  }, [submitting, setFocus]);

  const leaveToCart = (message: string) => {
    toast.error(message);
    onLeave();
    router.replace("/cart");
  };

  /** true — форма остаётся заблокированной (идёт переход на другую страницу). */
  const handle = async (body: CreateOrderBody): Promise<boolean> => {
    const outcome = resolveCreateOrderResult(await createOrder(body));
    switch (outcome.type) {
      case "success":
        onLeave();
        finishOrder();
        window.location.assign(outcome.confirmationUrl);
        return true;
      case "payment_provider_error":
        onLeave();
        finishOrder(); // заказ создан и оплачивается со страницы заказа
        onPaymentError({ orderUrl: outcome.orderUrl, orderNumber: outcome.orderNumber });
        return false;
      case "field_errors":
        outcome.errors.forEach((e) => setError(e.name, { type: "server", message: e.message }));
        focusAfterEnable.current = outcome.errors[0]?.name ?? null;
        if (outcome.fallbackMessage) toast.error(outcome.fallbackMessage);
        return false;
      case "price_changed": {
        refreshPrices();
        let sessionExpired = false;
        if (atelierPrices) {
          // Цены ателье + PRICE_CHANGED: если validate теперь отдаёт розницу — сессия истекла.
          const check = await validateCart(body.items);
          sessionExpired = check.ok && check.data.price_tier === "retail";
        }
        const { expectedTotal, actualTotal, actualFormatted } = outcome;
        setPending({ change: { expectedTotal, actualTotal, actualFormatted, sessionExpired }, body });
        return false;
      }
      case "cart_problem":
        leaveToCart(outcome.message);
        return true;
      case "new_attempt":
        clearRequestId(); // следующая отправка — новая попытка с новым client_request_id
        toast.error(outcome.message);
        return false;
      case "toast":
      case "network":
        toast.error(outcome.message);
        return false;
    }
  };

  const send = async (body: CreateOrderBody): Promise<void> => {
    if (inFlight.current) return; // повторный клик не создаёт второй запрос
    inFlight.current = true;
    setSubmitting(true);
    let stayBusy = false;
    try {
      stayBusy = await handle(body);
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      inFlight.current = false;
      if (!stayBusy) setSubmitting(false);
    }
  };

  return {
    submitting,
    priceChange: pending?.change ?? null,
    send,
    continueWithNewPrice: () => {
      if (!pending) return;
      const body = { ...pending.body, expected_total: pending.change.actualTotal };
      setPending(null);
      void send(body);
    },
    closePriceChange: () => setPending(null),
  };
}
