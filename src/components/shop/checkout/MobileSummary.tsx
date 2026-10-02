"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { CartTotals } from "@/components/shop/cart/CartTotals";
import { CartCheckError } from "@/components/shop/cart/CartCheckError";
import type { CheckoutSummaryState } from "@/components/shop/checkout/CheckoutSummaryState";
import { PayButton } from "@/components/shop/checkout/PayButton";
import { PaymentNotes } from "@/components/shop/checkout/PaymentNotes";
import { SummaryLines } from "@/components/shop/checkout/SummaryLines";
import { SummarySkeleton } from "@/components/shop/checkout/SummarySkeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Mobile: «Состав заказа · 133 700 ₽» — свёрнутый блок (details), раскрывается по клику. */
export function MobileSummary({ state }: { state: CheckoutSummaryState }) {
  const { status, data, refreshing, retry } = state;
  return (
    <details className="group rounded-xl border border-border bg-card md:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span>
          Состав заказа ·{" "}
          {data ? <span className="tabular-nums">{data.total_formatted}</span> : <Skeleton className="inline-block h-4 w-20" />}
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-4">
        {status === "error" ? (
          <CartCheckError onRetry={retry} />
        ) : data === null ? (
          <SummarySkeleton />
        ) : (
          <>
            <SummaryLines items={data.items} />
            <div className="border-t border-border pt-4">
              <CartTotals data={data} loading={false} refreshing={refreshing} />
            </div>
          </>
        )}
      </div>
    </details>
  );
}

/** Mobile: кнопка оплаты, прибитая к низу экрана (data-sticky-panel даёт странице нижний отступ). */
export function MobilePayBar({ state }: { state: CheckoutSummaryState }) {
  const { data, blocked, canPay, submitting } = state;
  return (
    <div
      data-sticky-panel
      className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-1.5 border-t border-border bg-background/95 p-3 backdrop-blur md:hidden"
    >
      <PayButton totalFormatted={data && !blocked ? data.total_formatted : null} disabled={!canPay} submitting={submitting} />
      {blocked ? (
        <p className="text-center text-xs text-muted-foreground">
          Часть позиций недоступна.{" "}
          <Link href="/cart" className="text-silver underline underline-offset-4">
            Вернуться в корзину
          </Link>
        </p>
      ) : (
        <PaymentNotes className="flex flex-col" />
      )}
    </div>
  );
}
