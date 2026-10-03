"use client";

import { AutosaveField } from "@/components/admin/orders/detail/AutosaveField";
import { Card } from "@/components/ui/card";
import { LIMITS, trackingError } from "@/lib/admin-ui/schemas";
import type { AdminOrderDetail } from "@/lib/admin-ui/types";
import { DELIVERY_METHOD_LABELS } from "@/lib/order-labels";
import { cn } from "@/lib/utils";

interface OrderDeliveryCardProps {
  order: AdminOrderDetail;
  className?: string;
  onSaveField: (patch: { tracking_number: string | null } | { courier_note: string | null }) => Promise<boolean>;
}

function destination(d: AdminOrderDetail["delivery"]): string {
  const parts = [d.city];
  if (d.cdek_pvz_code) parts.push(`ПВЗ ${d.cdek_pvz_code}`);
  if (d.address) parts.push(d.address);
  if (d.postal_code) parts.push(d.postal_code);
  return parts.join(", ");
}

export function OrderDeliveryCard({ order, className, onSaveField }: OrderDeliveryCardProps) {
  return (
    <Card className={cn("gap-4 p-5", className)}>
      <h2 className="text-lg font-semibold">Доставка</h2>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{DELIVERY_METHOD_LABELS[order.delivery.method]}</p>
        <p className="text-sm text-muted-foreground">{destination(order.delivery)}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <AutosaveField
          key={`tracking:${order.tracking_number ?? ""}`}
          label="Трек-номер"
          value={order.tracking_number}
          maxLength={40}
          validate={trackingError}
          onSave={(v) => onSaveField({ tracking_number: v })}
        />
        <AutosaveField
          key={`courier:${order.courier_note ?? ""}`}
          label="Заметка для курьера"
          value={order.courier_note}
          maxLength={LIMITS.courierNote}
          onSave={(v) => onSaveField({ courier_note: v })}
        />
      </div>
    </Card>
  );
}
