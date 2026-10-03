"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { AtelierApplyForm } from "@/components/shop/atelier/AtelierApplyForm";
import { AtelierFormSkeleton } from "@/components/shop/atelier/AtelierFormSkeleton";
import { AtelierGuestActions } from "@/components/shop/atelier/AtelierGuestActions";
import { AtelierApproved, AtelierPending, AtelierRejectedAlert } from "@/components/shop/atelier/AtelierStatusPanels";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAdminResource } from "@/hooks/use-admin-resource";
import { EMPTY_ATELIER_VALUES, valuesFromPrevious } from "@/lib/atelier-ui/form";
import type { MyAtelier } from "@/types/ateliers";

/** Правая колонка /atelier: гость / нет заявки / pending / approved / rejected; Loading и Error. */
export function AtelierPanel({ loggedIn }: { loggedIn: boolean }) {
  const me = useAdminResource<MyAtelier | null>(loggedIn ? "/api/ateliers/me" : null);
  // Только что поданная заявка: показываем pending без повторного запроса статуса.
  const [appliedAt, setAppliedAt] = useState<string | null>(null);

  if (!loggedIn) return <AtelierGuestActions />;
  if (appliedAt) return <AtelierPending createdAt={appliedAt} />;
  if (me.status === "error") {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden />
        <AlertTitle>{me.error?.message || "Не удалось загрузить статус заявки"}</AlertTitle>
        <div className="col-start-2 mt-2">
          <Button type="button" variant="outline" size="sm" onClick={me.reload}>Повторить</Button>
        </div>
      </Alert>
    );
  }
  if (me.status !== "ready") return <AtelierFormSkeleton />;

  const current = me.data;
  if (current?.status === "pending") return <AtelierPending createdAt={current.created_at} />;
  if (current?.status === "approved") return <AtelierApproved />;
  const rejected = current?.status === "rejected";
  return (
    <div className="flex flex-col gap-6">
      {rejected && <AtelierRejectedAlert reason={current.rejection_reason} />}
      <AtelierApplyForm
        initial={rejected ? valuesFromPrevious(current) : EMPTY_ATELIER_VALUES}
        resubmit={rejected}
        onApplied={() => setAppliedAt(new Date().toISOString())}
        onAlreadyApplied={me.reload}
      />
    </div>
  );
}
