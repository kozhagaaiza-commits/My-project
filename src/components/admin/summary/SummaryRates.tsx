"use client";

import { useState } from "react";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "@/lib/admin-ui/toast";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { adminRequest } from "@/lib/admin-ui/api";
import { daysSince, formatIsoDate, formatRate, pluralRu } from "@/lib/admin-ui/format";
import type { AdminRatesRefresh } from "@/lib/admin-ui/types";

export const RATES_STALE_AFTER_DAYS = 3;

interface SummaryRatesProps {
  ratesDate: string | null;
  onRefreshed: () => void;
}

/** Строка «Курс ЦБ от …»; старше 3 дней — Alert + «Загрузить курс» (POST /api/admin/exchange-rates/refresh). */
export function SummaryRates({ ratesDate, onRefreshed }: SummaryRatesProps) {
  const [busy, setBusy] = useState(false);
  const age = daysSince(ratesDate);
  const stale = ratesDate === null || (age !== null && age > RATES_STALE_AFTER_DAYS);

  async function refresh() {
    setBusy(true);
    try {
      const res = await adminRequest<AdminRatesRefresh>("POST", "/api/admin/exchange-rates/refresh", {});
      if (res.ok) {
        const usd = res.data.USD;
        toast.success(`Курс USD ${formatRate(usd.rate)} на ${formatIsoDate(usd.date)}`);
        onRefreshed();
      } else {
        toast.error(res.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const title =
    ratesDate === null || age === null
      ? "Курс ещё не загружался"
      : `Курс не обновлялся ${age} ${pluralRu(age, "день", "дня", "дней")}`;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {ratesDate ? `Курс ЦБ от ${formatIsoDate(ratesDate)}` : "Курс ЦБ не загружен"}
      </p>
      {stale && (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden />
          <AlertTitle>{title}</AlertTitle>
          <div className="col-start-2 mt-2">
            <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
              Загрузить курс
            </Button>
          </div>
        </Alert>
      )}
    </div>
  );
}
