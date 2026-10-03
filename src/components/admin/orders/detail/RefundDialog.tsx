"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/admin-ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OrderActions } from "@/hooks/use-admin-order-actions";
import { fieldErrors } from "@/lib/admin-ui/api";
import { normalizeDecimal, refundFormSchema, type RefundFormValues } from "@/lib/admin-ui/schemas";
import type { AdminOrderDetail } from "@/lib/admin-ui/types";
import { formatRub, kopecksToRubString, rubStringToKopecks } from "@/lib/money";

interface RefundDialogProps {
  order: AdminOrderDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refund: OrderActions["refund"];
}

/** Сумма из поля → копейки; невалидный ввод → null (для подписи кнопки). */
function toKopecks(value: string): number | null {
  try {
    return rubStringToKopecks(normalizeDecimal(value));
  } catch {
    return null;
  }
}

/** Возврат по US-008: сумма (по умолчанию refundable_amount), причина 5–500, «Вернуть товар на склад» для stock. */
export function RefundDialog({ order, open, onOpenChange, refund }: RefundDialogProps) {
  const stock = order.kind === "stock";
  const form = useForm<RefundFormValues>({
    resolver: zodResolver(refundFormSchema(order.refundable_amount)),
    defaultValues: { amount: kopecksToRubString(order.refundable_amount), reason: "", restock: stock },
  });
  const submitting = form.formState.isSubmitting;
  const kopecks = toKopecks(useWatch({ control: form.control, name: "amount" }));

  async function onSubmit(values: RefundFormValues) {
    const amount = toKopecks(values.amount);
    if (amount === null) return;
    const res = await refund(
      { amount, reason: values.reason, restock: stock && values.restock },
      { inline: ["VALIDATION_ERROR", "REFUND_EXCEEDS_PAID"] },
    );
    if (res.ok) {
      toast.success(`Возврат ${res.data.amount_formatted} оформлен`);
      onOpenChange(false);
    } else if (res.code === "REFUND_EXCEEDS_PAID") {
      form.setError("amount", { message: res.message }); // «Максимум к возврату: 133 700 ₽»
    } else if (res.code === "VALIDATION_ERROR") {
      const fields = fieldErrors(res);
      if (fields.amount) form.setError("amount", { message: fields.amount });
      if (fields.reason) form.setError("reason", { message: fields.reason });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (submitting ? undefined : onOpenChange(next))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Оформить возврат</DialogTitle>
          <DialogDescription>
            Заказ {order.number}. Доступно к возврату: {formatRub(order.refundable_amount)}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Сумма, ₽</FormLabel>
                  <FormControl><Input {...field} inputMode="decimal" autoComplete="off" className="font-mono tabular-nums" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Причина</FormLabel>
                  <FormControl><Textarea {...field} rows={3} maxLength={500} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {stock && (
              <FormField
                control={form.control}
                name="restock"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                    </FormControl>
                    <FormLabel className="font-normal">Вернуть товар на склад</FormLabel>
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
                Отмена
              </Button>
              <Button type="submit" variant="destructive" disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" aria-hidden />}
                {kopecks !== null && kopecks > 0 ? `Вернуть ${formatRub(kopecks)}` : "Вернуть"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
