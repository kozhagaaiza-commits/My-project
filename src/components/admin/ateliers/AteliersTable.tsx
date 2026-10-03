import { AtelierActions } from "@/components/admin/ateliers/AtelierActions";
import { InnCell, WebsiteCell } from "@/components/admin/ateliers/AtelierLinks";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/admin-ui/format";
import type { AdminAtelierListItem } from "@/types/ateliers";

interface AteliersTableProps {
  rows: AdminAtelierListItem[];
  busyId: string | null;
  onApprove: (a: AdminAtelierListItem) => void;
  onReject: (a: AdminAtelierListItem) => void;
}

/** Desktop (lg+): таблица; на tablet/mobile — Card-список. */
export function AteliersTable({ rows, busyId, onApprove, onReject }: AteliersTableProps) {
  return (
    <div className="hidden lg:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>ИНН</TableHead>
            <TableHead>Контакт</TableHead>
            <TableHead>Сайт</TableHead>
            <TableHead>Дата</TableHead>
            <TableHead className="text-right">Заказов</TableHead>
            <TableHead><span className="sr-only">Действия</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="max-w-48 whitespace-normal">
                <div className="font-medium">{a.company_name}</div>
                <div className="text-xs text-muted-foreground">{a.city}</div>
                {a.comment && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={a.comment}>{a.comment}</p>}
              </TableCell>
              <TableCell className="whitespace-normal"><InnCell inn={a.inn} /></TableCell>
              <TableCell className="whitespace-normal">
                <div>{a.contact_name}</div>
                <div className="font-mono text-xs text-muted-foreground">{a.phone}</div>
                <div className="text-xs break-all text-muted-foreground">{a.email}</div>
              </TableCell>
              <TableCell className="max-w-40 whitespace-normal"><WebsiteCell website={a.website} /></TableCell>
              <TableCell className="font-mono text-muted-foreground tabular-nums">{formatDateTime(a.created_at).slice(0, 10)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{a.orders_count}</TableCell>
              <TableCell>
                <AtelierActions atelier={a} busy={busyId === a.id} onApprove={onApprove} onReject={onReject} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
