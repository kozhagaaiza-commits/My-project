import { Loader2, Lock } from "lucide-react";
import { CHECKOUT_FORM_ID } from "@/components/shop/checkout/CheckoutForm";
import { Button } from "@/components/ui/button";

interface PayButtonProps {
  /** Итог из ответа validate («133 700 ₽»); null, пока ответа нет. */
  totalFormatted: string | null;
  disabled: boolean;
  submitting: boolean;
}

/** Единственная жёлтая кнопка экрана: submit формы оформления (атрибут form — кнопка лежит вне <form>). */
export function PayButton({ totalFormatted, disabled, submitting }: PayButtonProps) {
  return (
    <Button type="submit" form={CHECKOUT_FORM_ID} size="lg" disabled={disabled || submitting} className="h-11 w-full">
      {submitting ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          Создаём заказ…
        </>
      ) : (
        <>
          <Lock aria-hidden />
          {totalFormatted ? `Перейти к оплате · ${totalFormatted}` : "Перейти к оплате"}
        </>
      )}
    </Button>
  );
}
