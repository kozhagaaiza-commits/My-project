"use client";

import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminAtelierListItem } from "@/types/ateliers";

interface AtelierActionsProps {
  atelier: AdminAtelierListItem;
  busy: boolean;
  onApprove: (a: AdminAtelierListItem) => void;
  onReject: (a: AdminAtelierListItem) => void;
}

/** «Одобрить» / «Отклонить» — только для заявок на рассмотрении. Обе outline: жёлтая кнопка экрана не повторяется в каждой строке. */
export function AtelierActions({ atelier, busy, onApprove, onReject }: AtelierActionsProps) {
  if (atelier.status !== "pending") return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onApprove(atelier)}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
        Одобрить
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onReject(atelier)}>
        <X aria-hidden />
        Отклонить
      </Button>
    </div>
  );
}
