import { deliveryPlace } from "@/lib/order-page-view";
import type { OrderView } from "@/types/order-view";

interface OrderDeliveryInfoProps {
  view: OrderView;
}

/** Способ доставки, город и адрес/ПВЗ, получатель (контакты маскированы сервером). */
export function OrderDeliveryInfo({ view }: OrderDeliveryInfoProps) {
  const { delivery, customer } = view;
  return (
    <dl className="grid gap-3 border-t border-border pt-4 text-sm">
      <div className="flex flex-col gap-0.5">
        <dt className="text-muted-foreground">Доставка</dt>
        <dd>{delivery.method_label}</dd>
        <dd className="text-silver">{deliveryPlace(view)}</dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-muted-foreground">Получатель</dt>
        <dd>{customer.name}</dd>
        <dd className="font-mono text-xs text-silver">{customer.email_masked}</dd>
        <dd className="font-mono text-xs text-silver">{customer.phone_masked}</dd>
      </div>
    </dl>
  );
}
