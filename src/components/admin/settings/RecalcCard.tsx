"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/admin-ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminRequest } from "@/lib/admin-ui/api";
import { pluralRu } from "@/lib/admin-ui/format";
import type { AdminRecalculateResult, RepriceSkipped } from "@/lib/admin-ui/types";

type Busy = "preview" | "apply" | null;

function SkippedList({ skipped }: { skipped: RepriceSkipped[] }) {
  if (skipped.length === 0) return null;
  return (
    <Alert>
      <AlertDescription className="flex flex-col gap-1">
        <span className="font-medium">Пропущено: {skipped.length}</span>
        <ul className="flex flex-col gap-0.5 text-xs">
          {skipped.map((s) => (
            <li key={s.product_id}>
              {s.title} — <span className="text-muted-foreground">{s.reason}</span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/** «Пересчёт цен»: dry_run → таблица старая/новая → «Применить» (dry_run: false). */
export function RecalcCard() {
  const [busy, setBusy] = useState<Busy>(null);
  const [preview, setPreview] = useState<AdminRecalculateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<RepriceSkipped[]>([]);

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "apply");
    setError(null);
    if (!dryRun) setApplied([]);
    try {
      const res = await adminRequest<AdminRecalculateResult>("POST", "/api/admin/prices/recalculate", { dry_run: dryRun });
      if (!res.ok) {
        if (res.code === "RATE_NOT_LOADED") setError(res.message);
        else toast.error(res.message);
        return;
      }
      if (dryRun) {
        setPreview(res.data);
        setApplied([]);
      } else {
        const n = res.data.changes.length;
        toast.success(`Обновлено ${n} ${pluralRu(n, "цена", "цены", "цен")}`);
        setPreview(null);
        setApplied(res.data.skipped ?? []);
      }
    } finally {
      setBusy(null);
    }
  }

  const changes = preview?.changes ?? [];
  return (
    <Card className="gap-4 p-5 lg:col-span-2">
      <h2 className="text-lg font-semibold">Пересчёт цен</h2>
      <p className="text-sm text-muted-foreground">Пересчёт товаров с режимом «Авто» по последнему курсу ЦБ.</p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {preview && (
        changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {(preview.skipped ?? []).length > 0
              ? `Применить нечего: цены не изменятся, пропущено ${preview.skipped.length}. Без изменений: ${preview.unchanged}`
              : `Цены не изменятся. Без изменений: ${preview.unchanged}`}
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Товар</TableHead>
                  <TableHead className="text-right">Старая цена</TableHead>
                  <TableHead className="text-right">Новая цена</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changes.map((c) => (
                  <TableRow key={c.product_id}>
                    <TableCell className="max-w-72 whitespace-normal">{c.title}</TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap text-muted-foreground tabular-nums">{c.old_price_formatted}</TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap tabular-nums">{c.new_price_formatted}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">Без изменений: {preview.unchanged}</p>
          </>
        )
      )}
      <SkippedList skipped={preview ? (preview.skipped ?? []) : applied} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => run(true)} disabled={busy !== null}>
          {busy === "preview" && <Loader2 className="animate-spin" aria-hidden />}
          Показать изменения
        </Button>
        {changes.length > 0 && (
          <Button type="button" onClick={() => run(false)} disabled={busy !== null}>
            {busy === "apply" && <Loader2 className="animate-spin" aria-hidden />}
            Применить
          </Button>
        )}
      </div>
    </Card>
  );
}
