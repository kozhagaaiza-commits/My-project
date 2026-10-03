import Link from "next/link";
import { ProductRowMenu } from "@/components/admin/products/ProductRowMenu";
import { ProductStatusBadge } from "@/components/admin/products/ProductStatusBadge";
import { ProductThumb } from "@/components/admin/products/ProductThumb";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { availabilityText } from "@/lib/admin-products-ui/table-format";
import type { AdminProductRow } from "@/lib/admin-products-ui/types";

interface ProductsTableProps {
  rows: readonly AdminProductRow[];
  busyId: string | null;
  onArchive: (p: AdminProductRow) => void;
  onDelete: (p: AdminProductRow) => void;
}

/** md+: таблица; на tablet (md) скрыты «Цена ателье» и «Режим». */
export function ProductsTable({ rows, busyId, onArchive, onDelete }: ProductsTableProps) {
  return (
    <div className="hidden rounded-xl border bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16"><span className="sr-only">Фото</span></TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Название</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Наличие</TableHead>
            <TableHead className="text-right">Цена</TableHead>
            <TableHead className="hidden text-right lg:table-cell">Цена ателье</TableHead>
            <TableHead className="hidden lg:table-cell">Режим</TableHead>
            <TableHead className="w-12"><span className="sr-only">Действия</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id} data-testid="product-row">
              <TableCell><ProductThumb url={p.cover_url} title={p.title} /></TableCell>
              <TableCell className="font-mono text-xs">{p.sku}</TableCell>
              <TableCell className="max-w-72 whitespace-normal">
                <Link href={`/admin/products/${p.id}`} className="line-clamp-2 font-medium hover:underline">{p.title}</Link>
              </TableCell>
              <TableCell><ProductStatusBadge status={p.status} /></TableCell>
              <TableCell className="font-mono tabular-nums">{availabilityText(p)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{p.price_formatted}</TableCell>
              <TableCell className="hidden text-right font-mono tabular-nums lg:table-cell">{p.price_atelier_formatted ?? "—"}</TableCell>
              <TableCell className="hidden lg:table-cell">
                <Badge variant="outline">{p.pricing_mode === "auto" ? "Авто" : "Вручную"}</Badge>
              </TableCell>
              <TableCell>
                <ProductRowMenu product={p} disabled={busyId === p.id} onArchive={onArchive} onDelete={onDelete} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
