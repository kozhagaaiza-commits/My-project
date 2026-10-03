import { Skeleton } from "@/components/ui/skeleton";
import type { CartValidation } from "@/types/cart";
import { cn } from "@/lib/utils";

interface CartTotalsProps {
  data: CartValidation | null;
  /** Цен нет (первый ответ не пришёл или validate не ответил) — Skeleton / прочерк. */
  loading: boolean;
  failed?: boolean;
  refreshing?: boolean;
  /** Mobile (sticky-панель): только «Итого». */
  compactOnMobile?: boolean;
}

function Amount({ value, loading, failed }: { value: string | undefined; loading: boolean; failed: boolean }) {
  if (failed) return <span aria-label="Нет данных">—</span>;
  if (loading || value === undefined) return <Skeleton className="inline-block h-5 w-24 align-middle" />;
  return <span>{value}</span>;
}

/** «Товары / Доставка — бесплатно / Итого» (суммы только из ответа validate). */
export function CartTotals({ data, loading, failed = false, refreshing = false, compactOnMobile = false }: CartTotalsProps) {
  const hide = compactOnMobile ? "max-md:hidden" : "";
  return (
    <div className={cn("flex flex-col gap-2 text-sm tabular-nums", refreshing && "opacity-60")} aria-busy={refreshing}>
      {data?.price_tier === "atelier" && <p className="text-silver">Цены для ателье</p>}
      <div className={cn("flex items-center justify-between", hide)}>
        <span className="text-muted-foreground">Товары</span>
        <Amount value={data?.subtotal_formatted} loading={loading} failed={failed} />
      </div>
      <p className={cn("text-muted-foreground", hide)}>Доставка — бесплатно</p>
      <div className="flex items-center justify-between text-base font-semibold max-md:gap-3">
        <span>Итого</span>
        <Amount value={data?.total_formatted} loading={loading} failed={failed} />
      </div>
    </div>
  );
}
