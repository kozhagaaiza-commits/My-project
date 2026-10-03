"use client";

import { toast } from "@/lib/admin-ui/toast";
import { OrderActions } from "@/components/admin/orders/detail/OrderActions";
import { OrderAdminNoteCard } from "@/components/admin/orders/detail/OrderAdminNoteCard";
import { OrderAttentionAlert } from "@/components/admin/orders/detail/OrderAttentionAlert";
import { OrderDeliveryCard } from "@/components/admin/orders/detail/OrderDeliveryCard";
import { OrderHeader } from "@/components/admin/orders/detail/OrderHeader";
import { OrderHistoryCard } from "@/components/admin/orders/detail/OrderHistoryCard";
import { OrderCustomerCard, OrderVehicleCard } from "@/components/admin/orders/detail/OrderInfoCards";
import { OrderItemsCard } from "@/components/admin/orders/detail/OrderItemsCard";
import { OrderPaymentsCard } from "@/components/admin/orders/detail/OrderPaymentsCard";
import { OrderPreorderCard } from "@/components/admin/orders/detail/OrderPreorderCard";
import { useAdminOrderActions, type MetaPatchInput } from "@/hooks/use-admin-order-actions";
import type { AdminOrderDetail } from "@/lib/admin-ui/types";

interface OrderViewProps {
  order: AdminOrderDetail;
  reload: () => void;
}

/**
 * Desktop: 2 колонки (8/12 позиции, доставка, под заказ, история; 4/12 клиент, авто, платежи, заметка).
 * Tablet/mobile: одна колонка в порядке Блока 4 — через `order-*` на обёртках с `contents`.
 */
export function OrderView({ order, reload }: OrderViewProps) {
  const actions = useAdminOrderActions(order, reload);

  async function saveMeta(patch: MetaPatchInput): Promise<boolean> {
    const res = await actions.patchMeta(patch, { success: "Сохранено" });
    return res.ok;
  }

  async function savePreorder(patch: { expected_ready_at: string | null; customer_visible_note: string | null }) {
    const res = await actions.patchMeta(patch);
    if (res.ok) toast.success(res.data.customer_notified ? "Сохранено, клиент уведомлён" : "Сохранено");
    return res.ok;
  }

  return (
    <div className="flex flex-col gap-6">
      <OrderHeader order={order} actions={<OrderActions order={order} actions={actions} />} />
      {order.needs_attention && (
        <OrderAttentionAlert reason={order.attention_reason} onClear={() => saveMeta({ needs_attention: false })} />
      )}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="contents lg:col-span-8 lg:flex lg:flex-col lg:gap-4">
          <OrderItemsCard order={order} className="order-4 lg:order-none" />
          <OrderDeliveryCard order={order} className="order-3 lg:order-none" onSaveField={saveMeta} />
          {order.kind === "preorder" && (
            <OrderPreorderCard
              key={`${order.expected_ready_at ?? ""}|${order.customer_visible_note ?? ""}`}
              order={order}
              className="order-5 lg:order-none"
              onSave={savePreorder}
            />
          )}
          <OrderHistoryCard order={order} className="order-7 lg:order-none" />
        </div>
        <div className="contents lg:col-span-4 lg:flex lg:flex-col lg:gap-4">
          <OrderCustomerCard order={order} className="order-1 lg:order-none" />
          <OrderVehicleCard order={order} className="order-2 lg:order-none" />
          <OrderPaymentsCard order={order} className="order-6 lg:order-none" />
          <OrderAdminNoteCard order={order} className="order-8 lg:order-none" onSave={(v) => saveMeta({ admin_note: v })} />
        </div>
      </div>
    </div>
  );
}
