"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PricePreview } from "@/lib/admin-products-ui/price-preview";

interface PriceCalcLineProps {
  preview: PricePreview;
  /** Сообщение RATE_NOT_LOADED с сервера (показывается inline в блоке «Цена»). */
  serverError: string | null;
  refreshing: boolean;
  onRefreshRates: () => void;
}

/** Строка расчёта «800.00 USD × 83,5600 × 2.00 = 133 696 ₽ → 133 700 ₽»; без курса — кнопка «Загрузить курс сейчас». */
export function PriceCalcLine({ preview, serverError, refreshing, onRefreshRates }: PriceCalcLineProps) {
  const noRate = preview.kind === "no_rate" || serverError !== null;
  return (
    <div className="space-y-2 rounded-md border border-dashed p-3" data-testid="price-calc">
      {preview.kind === "ok" && !serverError && (
        <p className="font-mono text-sm break-words tabular-nums">{preview.line}</p>
      )}
      {preview.kind === "empty" && !serverError && (
        <p className="text-sm text-muted-foreground">Введите закупку, чтобы увидеть расчёт</p>
      )}
      {noRate && (
        <>
          <p role="alert" className="text-sm text-destructive">
            {serverError ?? (preview.kind === "no_rate" ? preview.line : "")}
          </p>
          <Button type="button" variant="outline" size="sm" disabled={refreshing} onClick={onRefreshRates}>
            {refreshing && <Loader2 className="animate-spin" aria-hidden />}
            Загрузить курс сейчас
          </Button>
        </>
      )}
    </div>
  );
}
