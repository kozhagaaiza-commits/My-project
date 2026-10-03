"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OrderActions } from "@/hooks/use-admin-order-actions";
import { fieldErrors } from "@/lib/admin-ui/api";
import { shipFormSchema, type ShipFormValues } from "@/lib/admin-ui/schemas";
import type { AdminOrderDetail } from "@/lib/admin-ui/types";

interface ShipDialogProps {
  order: AdminOrderDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changeStatus: OrderActions["changeStatus"];
}

/** Переход в shipped: обязательный трек-номер (СДЭК) или заметка курьера (Москва). US-007, шаг 7. */
export function ShipDialog({ order, open, onOpenChange, changeStatus }: ShipDialogProps) {
  const courier = order.delivery.method === "moscow_courier";
  const form = useForm<ShipFormValues>({
    resolver: zodResolver(shipFormSchema(!courier)),
    defaultValues: {
      tracking_number: order.tracking_number ?? "",
      courier_note: order.courier_note ?? "",
      note: "",
    },
  });
  const submitting = form.formState.isSubmitting;

  async function onSubmit(values: ShipFormValues) {
    const res = await changeStatus(
      {
        to_status: "shipped",
        tracking_number: values.tracking_number || null,
        courier_note: values.courier_note || null,
        note: values.note || null,
      },
      { inline: ["VALIDATION_ERROR"], success: "Заказ передан в доставку" },
    );
    if (res.ok) {
      onOpenChange(false);
      return;
    }
    if (res.code === "VALIDATION_ERROR") {
      const fields = fieldErrors(res);
      const names = (["tracking_number", "courier_note", "note"] as const).filter((n) => fields[n]);
      for (const name of names) form.setError(name, { message: fields[name] });
      if (names.length > 0) form.setFocus(names[0]);
      else form.setError(courier ? "courier_note" : "tracking_number", { message: res.message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (submitting ? undefined : onOpenChange(next))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Передать в доставку</DialogTitle>
          <DialogDescription>
            {courier ? "Для курьера по Москве обязательна заметка." : "Для СДЭК обязателен трек-номер."} Клиент получит уведомление.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            {!courier && (
              <FormField
                control={form.control}
                name="tracking_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Трек-номер СДЭК</FormLabel>
                    <FormControl><Input {...field} autoComplete="off" className="font-mono" maxLength={40} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {courier && (
              <FormField
                control={form.control}
                name="courier_note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Заметка для курьера</FormLabel>
                    <FormControl><Textarea {...field} rows={3} maxLength={300} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Комментарий в историю (необязательно)</FormLabel>
                  <FormControl><Input {...field} maxLength={500} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
                Отмена
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" aria-hidden />}
                Подтвердить отправку
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
