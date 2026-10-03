"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface OrderAttentionAlertProps {
  reason: string | null;
  onClear: () => Promise<boolean>;
}

/** Alert destructive при needs_attention: attention_reason + «Снять отметку». */
export function OrderAttentionAlert({ reason, onClear }: OrderAttentionAlertProps) {
  const [busy, setBusy] = useState(false);
  async function clear() {
    setBusy(true);
    try {
      await onClear();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden />
      <AlertTitle>Требует внимания</AlertTitle>
      {reason && <AlertDescription>{reason}</AlertDescription>}
      <div className="col-start-2 mt-2">
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Снять отметку
        </Button>
      </div>
    </Alert>
  );
}
