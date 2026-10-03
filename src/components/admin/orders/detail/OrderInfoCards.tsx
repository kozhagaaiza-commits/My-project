import { CopyButton } from "@/components/admin/orders/detail/CopyButton";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/admin-ui/format";
import type { AdminOrderDetail } from "@/lib/admin-ui/types";
import { cn } from "@/lib/utils";

interface CardProps {
  order: AdminOrderDetail;
  className?: string;
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

const linkClass = "text-silver underline-offset-4 hover:underline";

export function OrderCustomerCard({ order, className }: CardProps) {
  const { customer } = order;
  const consent = order.consent_pd_at
    ? `${formatDateTime(order.consent_pd_at)}${order.consent_policy_version ? ` · версия ${order.consent_policy_version}` : ""}`
    : "Не зафиксировано";
  return (
    <Card className={cn("gap-4 p-5", className)}>
      <h2 className="text-lg font-semibold">Клиент</h2>
      <dl className="flex flex-col gap-3">
        <Row term="Имя">{customer.name}</Row>
        <Row term="Телефон">
          <a href={`tel:${customer.phone}`} className={cn("font-mono", linkClass)}>{customer.phone}</a>
        </Row>
        <Row term="Email">
          <a href={`mailto:${customer.email}`} className={linkClass}>{customer.email}</a>
        </Row>
        <Row term="Telegram">{order.telegram_subscribed ? "Подписан на уведомления" : "Не подписан"}</Row>
        <Row term="Согласие на обработку ПДн"><span className="font-mono text-xs">{consent}</span></Row>
      </dl>
    </Card>
  );
}

export function OrderVehicleCard({ order, className }: CardProps) {
  return (
    <Card className={cn("gap-4 p-5", className)}>
      <h2 className="text-lg font-semibold">Автомобиль</h2>
      <dl className="flex flex-col gap-3">
        <Row term="Модель">{order.vehicle_label ?? "Не указан"}</Row>
        <Row term="VIN">
          {order.vin ? (
            <span className="flex items-center gap-1">
              <span className="font-mono">{order.vin}</span>
              <CopyButton value={order.vin} label="Скопировать VIN" successMessage="VIN скопирован" />
            </span>
          ) : (
            "Не указан"
          )}
        </Row>
        {order.customer_comment && <Row term="Комментарий клиента">{order.customer_comment}</Row>}
      </dl>
    </Card>
  );
}
