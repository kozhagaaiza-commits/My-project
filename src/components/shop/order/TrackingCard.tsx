"use client";

import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { safeNavigationUrl } from "@/lib/checkout-response";
import type { OrderView } from "@/types/order-view";

interface TrackingCardProps {
  tracking: OrderView["tracking"];
  courierNote: string | null;
}

async function copyTrack(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast("Трек-номер скопирован");
  } catch {
    toast.error("Не удалось скопировать. Выделите номер вручную");
  }
}

/** Трек-номер СДЭК (копирование + ссылка «Отследить в СДЭК») или courier_note для курьера по Москве. */
export function TrackingCard({ tracking, courierNote }: TrackingCardProps) {
  const url = tracking ? safeNavigationUrl(tracking.url) : null;
  if (!tracking && !courierNote) return null;
  return (
    <Card className="gap-3 p-5" role="region" aria-label="Доставка">
      {tracking && (
        <>
          <h2 className="text-lg font-semibold">Трек-номер</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-lg tabular-nums" data-testid="tracking-number">{tracking.number}</span>
            <Button type="button" variant="ghost" size="icon" aria-label="Скопировать трек-номер" onClick={() => void copyTrack(tracking.number)}>
              <Copy aria-hidden />
            </Button>
          </div>
          {url && (
            <Button asChild variant="outline" className="w-full sm:w-fit">
              <a href={url} target="_blank" rel="noopener noreferrer">
                Отследить в СДЭК
                <ExternalLink aria-hidden />
              </a>
            </Button>
          )}
        </>
      )}
      {courierNote && (
        <>
          {!tracking && <h2 className="text-lg font-semibold">Курьер по Москве</h2>}
          <p className="text-sm" data-testid="courier-note">{courierNote}</p>
        </>
      )}
    </Card>
  );
}
