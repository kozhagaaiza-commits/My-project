"use client";

import Link from "next/link";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatRub } from "@/lib/money";

export interface PriceChange {
  expectedTotal: number;
  actualTotal: number;
  actualFormatted: string;
  /** Сессия ателье истекла: сервер посчитал розничные цены (Edge Case 20). */
  sessionExpired: boolean;
}

interface PriceChangedDialogProps {
  change: PriceChange | null;
  onContinue: () => void;
  onBackToCart: () => void;
  onClose: () => void;
}

/** 409 PRICE_CHANGED (US-003 шаг 8) и истёкшая сессия ателье (Edge Case 20). */
export function PriceChangedDialog({ change, onContinue, onBackToCart, onClose }: PriceChangedDialogProps) {
  return (
    <AlertDialog open={change !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent aria-describedby={undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {change?.sessionExpired
              ? "Сессия истекла, показаны розничные цены. Войдите снова, чтобы получить цены ателье"
              : change && `Цена изменилась: было ${formatRub(change.expectedTotal)}, стало ${change.actualFormatted}. Продолжить?`}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onBackToCart}>Вернуться в корзину</AlertDialogCancel>
          {change?.sessionExpired ? (
            <AlertDialogAction asChild>
              <Link href="/auth/login?next=/checkout">Войти</Link>
            </AlertDialogAction>
          ) : (
            <AlertDialogAction onClick={onContinue}>Продолжить</AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
