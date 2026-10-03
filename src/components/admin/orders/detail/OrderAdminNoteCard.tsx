"use client";

import { AutosaveField } from "@/components/admin/orders/detail/AutosaveField";
import { Card } from "@/components/ui/card";
import { LIMITS } from "@/lib/admin-ui/schemas";
import type { AdminOrderDetail } from "@/lib/admin-ui/types";
import { cn } from "@/lib/utils";

interface OrderAdminNoteCardProps {
  order: AdminOrderDetail;
  className?: string;
  onSave: (value: string | null) => Promise<boolean>;
}

/** «Заметка админа» (видна только админу), автосохранение по blur. */
export function OrderAdminNoteCard({ order, className, onSave }: OrderAdminNoteCardProps) {
  return (
    <Card className={cn("p-5", className)}>
      <AutosaveField
        key={`note:${order.admin_note ?? ""}`}
        label="Заметка админа"
        value={order.admin_note}
        maxLength={LIMITS.adminNote}
        multiline
        hint="Видна только админу"
        onSave={onSave}
      />
    </Card>
  );
}
