"use client";

import { useRouter } from "next/navigation";
import { Form } from "@/components/ui/form";
import { CheckoutForm } from "@/components/shop/checkout/CheckoutForm";
import { hasBlockingProblem, type CheckoutSummaryState } from "@/components/shop/checkout/CheckoutSummaryState";
import { MobilePayBar, MobileSummary } from "@/components/shop/checkout/MobileSummary";
import { OrderSummary } from "@/components/shop/checkout/OrderSummary";
import { PriceChangedDialog } from "@/components/shop/checkout/PriceChangedDialog";
import type { PaymentErrorInfo } from "@/components/shop/checkout/PaymentErrorDialog";
import { useCheckoutForm } from "@/hooks/use-checkout-form";
import { useCheckoutSubmit } from "@/hooks/use-checkout-submit";
import { useStoredVehicle } from "@/hooks/use-stored-vehicle";
import { useCartValidation } from "@/hooks/use-cart-validation";
import type { Cart } from "@/lib/cart-store";
import { uuid } from "@/lib/schemas/common";

interface CheckoutContentProps {
  cart: Cart;
  onLeave: () => void;
  onPaymentError: (info: PaymentErrorInfo) => void;
}

/**
 * Форма + «Состав заказа». Desktop (lg) — форма 7/12 и OrderSummary 5/12 sticky; tablet (md) — одна колонка,
 * OrderSummary после формы; mobile — свёрнутый «Состав заказа · сумма» сверху и кнопка оплаты, прибитая к низу.
 */
export function CheckoutContent({ cart, onLeave, onPaymentError }: CheckoutContentProps) {
  const router = useRouter();
  const validation = useCartValidation();
  const vehicle = useStoredVehicle();
  const data = validation.status === "error" ? null : validation.data;
  const vehicleId = vehicle && uuid.safeParse(vehicle.id).success ? vehicle.id : null;

  const form = useCheckoutForm({ cart, expectedTotal: data?.total ?? null, vehicleId });
  const submit = useCheckoutSubmit({
    setError: form.setError,
    setFocus: form.setFocus,
    refreshPrices: validation.retry,
    atelierPrices: data?.price_tier === "atelier",
    onLeave,
    onPaymentError,
  });

  const blocked = data !== null && (!data.can_checkout || hasBlockingProblem(data.items));
  const summary: CheckoutSummaryState = {
    status: validation.status,
    data,
    refreshing: validation.refreshing,
    blocked,
    canPay: validation.status === "ready" && !validation.refreshing && data !== null && !blocked,
    submitting: submit.submitting,
    retry: validation.retry,
  };

  const onSubmit = form.handleSubmit(submit.send);

  return (
    <Form {...form}>
      <div className="grid gap-6 lg:grid-cols-[7fr_5fr] lg:items-start lg:gap-8">
        <MobileSummary state={summary} />
        <CheckoutForm
          submitting={submit.submitting}
          vehicle={vehicle}
          onSubmit={(e) => {
            e.preventDefault();
            if (summary.canPay) void onSubmit(e);
          }}
        />
        <OrderSummary state={summary} className="hidden md:flex lg:sticky lg:top-6" />
      </div>
      <MobilePayBar state={summary} />
      <PriceChangedDialog
        change={submit.priceChange}
        onContinue={submit.continueWithNewPrice}
        onBackToCart={() => router.push("/cart")}
        onClose={submit.closePriceChange}
      />
    </Form>
  );
}
