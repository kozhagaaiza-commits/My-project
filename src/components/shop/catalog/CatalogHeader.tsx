import { pluralPositions } from "@/components/shop/catalog/catalog-params";
import type { ProductType } from "@/types/catalog";

interface CatalogHeaderProps {
  type: ProductType;
  /** «BMW 5 Series G30», если выбран автомобиль. */
  vehicleName: string | null;
  total: number;
}

export function CatalogHeader({ type, vehicleName, total }: CatalogHeaderProps) {
  const wheels = type === "wheel_set";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {wheels ? (vehicleName ? `Диски для ${vehicleName}` : "Диски") : "Карбон под заказ"}
        </h1>
        <p className="text-sm text-muted-foreground tabular-nums">{pluralPositions(total)}</p>
      </div>
      {!wheels && (
        <p className="text-sm text-silver">Срок поставки 21–45 дней · 100% предоплата · гарантия</p>
      )}
    </div>
  );
}
