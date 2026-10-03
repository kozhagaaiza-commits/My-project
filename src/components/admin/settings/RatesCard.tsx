"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "@/lib/admin-ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { adminRequest } from "@/lib/admin-ui/api";
import { formatIsoDate, formatRate } from "@/lib/admin-ui/format";
import type { AdminRatesRefresh, AdminSettings } from "@/lib/admin-ui/types";

interface RatesCardProps {
  rates: AdminSettings["rates"];
  onRefreshed: () => void;
}

const CURRENCIES = ["USD", "CNY"] as const;

/** «Курс ЦБ»: USD и CNY с датой, «Загрузить сейчас»; ошибка ЦБ — inline в карточке. */
export function RatesCard({ rates, onRefreshed }: RatesCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = CURRENCIES.some((c) => rates[c]);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const res = await adminRequest<AdminRatesRefresh>("POST", "/api/admin/exchange-rates/refresh", {});
      if (res.ok) {
        toast.success(`Курс USD ${formatRate(res.data.USD.rate)} на ${formatIsoDate(res.data.USD.date)}`);
        onRefreshed();
      } else {
        setError(res.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-4 p-5">
      <h2 className="text-lg font-semibold">Курс ЦБ</h2>
      {loaded ? (
        <dl className="flex flex-col gap-2">
          {CURRENCIES.map((c) => {
            const entry = rates[c];
            return (
              <div key={c} className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="font-mono text-muted-foreground">{c}</dt>
                <dd className="font-mono tabular-nums">
                  {entry ? (
                    <>
                      {formatRate(entry.rate)} <span className="text-xs text-muted-foreground">от {formatIsoDate(entry.date)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">не загружен</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Курс ещё не загружался</p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="button" variant="outline" onClick={refresh} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          Загрузить сейчас
        </Button>
      </div>
    </Card>
  );
}
