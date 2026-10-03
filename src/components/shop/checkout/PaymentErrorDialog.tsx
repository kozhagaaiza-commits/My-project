"use client";

import { useRouter } from "next/navigation";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RESERVATION_MINUTES } from "@/lib/config";

export interface PaymentErrorInfo {
  /** null — ссылка не прошла проверку (чужой origin): показываем только текст. */
  orderUrl: string | null;
  orderNumber: string | null;
}

/** 502 PAYMENT_PROVIDER_ERROR: заказ создан, оплата — со страницы заказа (Edge Case 2). Закрыть без перехода нельзя. */
export function PaymentErrorDialog({ info }: { info: PaymentErrorInfo | null }) {
  const router = useRouter();
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
          {info?.orderUrl ? (
            <AlertDialogAction onClick={() => info.orderUrl && window.location.assign(info.orderUrl)}>Перейти к заказу</AlertDialogAction>
          ) : (
            <AlertDialogAction onClick={() => router.push("/")}>На главную</AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
