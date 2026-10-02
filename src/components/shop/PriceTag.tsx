import { cn } from "@/lib/utils";

interface PriceTagProps {
  price_formatted: string;
  price_atelier_formatted?: string | null;
  /** «за комплект» для дисков, «за 1 шт.» для карбона. */
  unit: string;
  className?: string;
}

export function PriceTag({ price_formatted, price_atelier_formatted, unit, className }: PriceTagProps) {
  if (price_atelier_formatted) {
    return (
      <div className={cn("flex flex-col", className)}>
        <p className="text-lg font-semibold tabular-nums">Для ателье: {price_atelier_formatted}</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          <s>{price_formatted}</s> {unit}
        </p>
      </div>
    );
  }
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-1.5", className)}>
      <span className="text-lg font-semibold tabular-nums">{price_formatted}</span>
      <span className="text-sm text-muted-foreground">{unit}</span>
    </p>
  );
}
