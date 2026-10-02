"use client";

import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RESERVATION_MINUTES } from "@/lib/config";

export interface PaymentErrorInfo {
  orderUrl: string;
  orderNumber: string | null;
}

/** 502 PAYMENT_PROVIDER_ERROR: заказ создан, оплата — со страницы заказа (Edge Case 2). Закрыть без перехода нельзя. */
export function PaymentErrorDialog({ info }: { info: PaymentErrorInfo | null }) {
  return (
    <AlertDialog open={info !== null}>
      <AlertDialogContent aria-describedby={undefined} onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Платёжный сервис временно недоступен.{" "}
            {info?.orderNumber ? (
              <>Заказ <span className="font-mono">{info.orderNumber}</span> сохранён</>
            ) : (
              "Заказ сохранён"
            )}{" "}
            на {RESERVATION_MINUTES} минут
          </AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => info && window.location.assign(info.orderUrl)}>Перейти к заказу</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
