import { cn } from "@/lib/utils";

interface PriceTagProps {
  price_formatted: string;
  price_atelier_formatted?: string | null;
  /** «за комплект» для дисков, «за 1 шт.» для карбона. */
  unit: string;
  /** large — карточка товара. */
  size?: "default" | "large";
  className?: string;
}

export function PriceTag({ price_formatted, price_atelier_formatted, unit, size = "default", className }: PriceTagProps) {
  const amount = size === "large" ? "text-2xl" : "text-lg";
  if (price_atelier_formatted) {
    return (
      <div className={cn("flex flex-col", className)}>
        <p className={cn(amount, "font-semibold tabular-nums")}>Для ателье: {price_atelier_formatted}</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          Розница: <s>{price_formatted}</s> {unit}
        </p>
      </div>
    );
  }
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-1.5", className)}>
      <span className={cn(amount, "font-semibold tabular-nums")}>{price_formatted}</span>
      <span className="text-sm text-muted-foreground">{unit}</span>
    </p>
  );
}
