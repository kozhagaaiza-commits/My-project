import Link from "next/link";
import { ProductRowMenu } from "@/components/admin/products/ProductRowMenu";
import { ProductStatusBadge } from "@/components/admin/products/ProductStatusBadge";
import { ProductThumb } from "@/components/admin/products/ProductThumb";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { availabilityText } from "@/lib/admin-products-ui/table-format";
import type { AdminProductRow } from "@/lib/admin-products-ui/types";

interface ProductsCardListProps {
  rows: readonly AdminProductRow[];
  busyId: string | null;
  onArchive: (p: AdminProductRow) => void;
  onDelete: (p: AdminProductRow) => void;
}

/** Mobile (< md): список Card вместо таблицы. */
export function ProductsCardList({ rows, busyId, onArchive, onDelete }: ProductsCardListProps) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {rows.map((p) => (
        <li key={p.id}>
          <Card className="flex-row items-start gap-3 p-3" data-testid="product-card">
            <ProductThumb url={p.cover_url} title={p.title} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Link href={`/admin/products/${p.id}`} className="line-clamp-2 text-sm font-medium hover:underline">{p.title}</Link>
              <p className="font-mono text-xs text-muted-foreground">{p.sku}</p>
              <div className="flex flex-wrap items-center gap-2">
                <ProductStatusBadge status={p.status} />
                <Badge variant="outline">{p.pricing_mode === "auto" ? "Авто" : "Вручную"}</Badge>
              </div>
              <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-mono font-semibold tabular-nums">{p.price_formatted}</span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{availabilityText(p)}</span>
              </p>
              {p.price_atelier_formatted && (
                <p className="font-mono text-xs text-muted-foreground tabular-nums">Ателье: {p.price_atelier_formatted}</p>
              )}
            </div>
            <ProductRowMenu product={p} disabled={busyId === p.id} onArchive={onArchive} onDelete={onDelete} />
          </Card>
        </li>
      ))}
    </ul>
  );
}
