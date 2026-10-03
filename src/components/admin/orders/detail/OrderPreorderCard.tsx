"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS } from "@/lib/admin-ui/schemas";
import type { AdminOrderDetail } from "@/lib/admin-ui/types";
import { cn } from "@/lib/utils";

interface OrderPreorderCardProps {
  order: AdminOrderDetail;
  className?: string;
  /** Изменение даты или сообщения уведомляет покупателя («Срок поставки изменился»). */
  onSave: (patch: { expected_ready_at: string | null; customer_visible_note: string | null }) => Promise<boolean>;
}

/** «Под заказ» (только preorder): ожидаемая дата, сообщение клиенту, «Сохранить и уведомить». */
export function OrderPreorderCard({ order, className, onSave }: OrderPreorderCardProps) {
  const id = useId();
  const [date, setDate] = useState(order.expected_ready_at ?? "");
  const [note, setNote] = useState(order.customer_visible_note ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave({ expected_ready_at: date || null, customer_visible_note: note.trim() || null });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={cn("gap-4 p-5", className)}>
      <h2 className="text-lg font-semibold">Под заказ</h2>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-date`}>Ожидаем на складе</Label>
        <Input id={`${id}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full md:w-48" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-note`}>Сообщение клиенту</Label>
        <Textarea
          id={`${id}-note`}
          value={note}
          maxLength={LIMITS.customerNote}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Клиент увидит сообщение на странице заказа и получит уведомление</p>
      </div>
      <div>
        <Button type="button" variant="outline" onClick={save} disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          Сохранить и уведомить
        </Button>
      </div>
    </Card>
  );
}
