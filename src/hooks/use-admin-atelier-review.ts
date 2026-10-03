"use client";

import { useCallback, useState } from "react";
import { adminRequest } from "@/lib/admin-ui/api";
import { toast } from "@/lib/admin-ui/toast";
import type { AdminAtelierListItem } from "@/types/ateliers";

const FAILED = "Не удалось сохранить решение. Повторите";

/** PATCH /api/admin/ateliers/[id]: одобрить / отклонить с причиной. CONFLICT (ИНН уже одобрен) — toast с текстом ответа. */
export function useAdminAtelierReview(onDone: () => void) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const send = useCallback(
    async (row: AdminAtelierListItem, body: { status: "approved"; rejection_reason: null } | { status: "rejected"; rejection_reason: string }) => {
      setBusyId(row.id);
      const res = await adminRequest("PATCH", `/api/admin/ateliers/${row.id}`, body);
      setBusyId(null);
      if (res.ok) {
        toast.success(body.status === "approved" ? `Заявка ${row.company_name} одобрена` : `Заявка ${row.company_name} отклонена`);
        onDone();
        return true;
      }
      toast.error(res.code === "CONFLICT" || res.code === "VALIDATION_ERROR" ? res.message : FAILED);
      if (res.status === 404) onDone();
      return false;
    },
    [onDone],
  );

  const approve = useCallback((row: AdminAtelierListItem) => send(row, { status: "approved", rejection_reason: null }), [send]);
  const reject = useCallback((row: AdminAtelierListItem, reason: string) => send(row, { status: "rejected", rejection_reason: reason }), [send]);
  return { busyId, approve, reject };
}
