"use client";

import Link from "next/link";
import { CartTotals } from "@/components/shop/cart/CartTotals";
import { CartCheckError } from "@/components/shop/cart/CartCheckError";
import type { CheckoutSummaryState } from "@/components/shop/checkout/CheckoutSummaryState";
import { PayButton } from "@/components/shop/checkout/PayButton";
import { PaymentNotes } from "@/components/shop/checkout/PaymentNotes";
import { SummaryLines } from "@/components/shop/checkout/SummaryLines";
import { SummarySkeleton } from "@/components/shop/checkout/SummarySkeleton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface OrderSummaryProps {
  state: CheckoutSummaryState;
  className?: string;
}

/** «Состав заказа» для tablet/desktop: позиции, итог, жёлтая «Перейти к оплате · …», способы оплаты. */
export function OrderSummary({ state, className }: OrderSummaryProps) {
  const { status, data, refreshing, blocked, canPay, submitting, retry } = state;
  return (
    <Card className={cn("gap-4 p-5", className)} aria-label="Состав заказа" role="region">
      <h2 className="text-lg font-semibold">Состав заказа</h2>
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
      <div className="flex flex-col gap-3">
        <PayButton totalFormatted={data && !blocked ? data.total_formatted : null} disabled={!canPay} submitting={submitting} />
        {blocked && (
          <p className="text-center text-sm text-muted-foreground">
            Часть позиций недоступна.{" "}
            <Link href="/cart" className="text-silver underline underline-offset-4 hover:text-foreground">
              Вернуться в корзину
            </Link>
          </p>
        )}
        <PaymentNotes className="flex flex-col gap-1" />
      </div>
    </Card>
  );
}
