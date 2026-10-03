"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ATELIER_REJECTION_MAX, ATELIER_REJECTION_MIN } from "@/lib/admin-ui/ateliers-query";
import type { AdminAtelierListItem } from "@/types/ateliers";

interface RejectDialogProps {
  /** null — диалог закрыт. */
  atelier: AdminAtelierListItem | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (atelier: AdminAtelierListItem, reason: string) => void;
}

/** Диалог «Отклонить»: обязательная причина 10–500 символов (её увидит клиент). */
export function RejectDialog({ atelier, busy, onCancel, onConfirm }: RejectDialogProps) {
  return (
    <Dialog open={atelier !== null} onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent>
        {atelier && <RejectForm key={atelier.id} atelier={atelier} busy={busy} onCancel={onCancel} onConfirm={onConfirm} />}
      </DialogContent>
    </Dialog>
  );
}

function RejectForm({ atelier, busy, onCancel, onConfirm }: Omit<RejectDialogProps, "atelier"> & { atelier: AdminAtelierListItem }) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const length = reason.trim().length;
  const invalid = length < ATELIER_REJECTION_MIN || length > ATELIER_REJECTION_MAX;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!invalid) onConfirm(atelier, reason.trim());
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Отклонить заявку {atelier.company_name}</DialogTitle>
        <DialogDescription>Причину увидит клиент: на странице «Для ателье» и в письме.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="atelier-reject-reason">Причина отказа</Label>
        <Textarea
          id="atelier-reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={ATELIER_REJECTION_MAX}
          aria-invalid={touched && invalid}
          aria-describedby="atelier-reject-hint"
          placeholder="Например: не нашли информации об ателье, пришлите ссылку на сайт или соцсети"
        />
        <p id="atelier-reject-hint" className={touched && invalid ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
          {touched && invalid
            ? `Укажите причину: от ${ATELIER_REJECTION_MIN} до ${ATELIER_REJECTION_MAX} символов`
            : `${length} / ${ATELIER_REJECTION_MAX}`}
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Отмена</Button>
        <Button type="submit" variant="destructive" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Отклонить
        </Button>
      </DialogFooter>
    </form>
  );
}
