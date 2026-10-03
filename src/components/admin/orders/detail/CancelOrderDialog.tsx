"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { OrderActions } from "@/hooks/use-admin-order-actions";

interface CancelOrderDialogProps {
  number: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changeStatus: OrderActions["changeStatus"];
}

/** Отмена — только из pending_payment (Блок 5.3). */
export function CancelOrderDialog({ number, open, onOpenChange, changeStatus }: CancelOrderDialogProps) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const res = await changeStatus({ to_status: "cancelled" }, { success: "Заказ отменён" });
      if (res.ok) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Отменить неоплаченный заказ?</AlertDialogTitle>
          <AlertDialogDescription>Заказ {number} получит статус «Отменён», бронь снимется. Вернуть его в работу нельзя.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Назад</AlertDialogCancel>
          <Button type="button" variant="destructive" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Отменить заказ
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
