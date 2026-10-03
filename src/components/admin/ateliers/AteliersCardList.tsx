import { AtelierActions } from "@/components/admin/ateliers/AtelierActions";
import { InnCell, WebsiteCell } from "@/components/admin/ateliers/AtelierLinks";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/admin-ui/format";
import type { AdminAtelierListItem } from "@/types/ateliers";

interface AteliersCardListProps {
  rows: AdminAtelierListItem[];
  busyId: string | null;
  onApprove: (a: AdminAtelierListItem) => void;
  onReject: (a: AdminAtelierListItem) => void;
}

/** Tablet/mobile (< lg): Card-список, кнопки внизу карточки. */
export function AteliersCardList({ rows, busyId, onApprove, onReject }: AteliersCardListProps) {
  return (
    <ul className="flex flex-col gap-3 lg:hidden">
      {rows.map((a) => (
        <li key={a.id}>
          <Card className="gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-medium">{a.company_name}</h2>
                <p className="text-sm text-muted-foreground">{a.city}</p>
              </div>
              <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                {formatDateTime(a.created_at).slice(0, 10)}
              </span>
            </div>
            <InnCell inn={a.inn} />
            <div className="text-sm">
              <div>{a.contact_name}</div>
              <div className="font-mono text-xs text-muted-foreground">{a.phone}</div>
              <div className="text-xs break-all text-muted-foreground">{a.email}</div>
            </div>
            <div className="text-sm"><WebsiteCell website={a.website} /></div>
            {a.comment && <p className="text-sm text-muted-foreground">{a.comment}</p>}
            <p className="text-xs text-muted-foreground">Заказов: <span className="font-mono tabular-nums">{a.orders_count}</span></p>
            <AtelierActions atelier={a} busy={busyId === a.id} onApprove={onApprove} onReject={onReject} />
          </Card>
        </li>
      ))}
    </ul>
  );
}
