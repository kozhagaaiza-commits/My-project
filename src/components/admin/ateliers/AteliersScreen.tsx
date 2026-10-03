"use client";

import { useState } from "react";
import { AdminErrorAlert } from "@/components/admin/layout/AdminErrorAlert";
import { AdminPagination } from "@/components/admin/layout/AdminPagination";
import { AteliersCardList } from "@/components/admin/ateliers/AteliersCardList";
import { AteliersEmpty } from "@/components/admin/ateliers/AteliersEmpty";
import { AteliersSkeleton } from "@/components/admin/ateliers/AteliersSkeleton";
import { AteliersTable } from "@/components/admin/ateliers/AteliersTable";
import { RejectDialog } from "@/components/admin/ateliers/RejectDialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminAtelierReview } from "@/hooks/use-admin-atelier-review";
import { useAdminAteliersFilters } from "@/hooks/use-admin-ateliers-filters";
import { useAdminResource } from "@/hooks/use-admin-resource";
import {
  ATELIERS_PER_PAGE, ATELIER_TABS, ateliersApiUrl, ateliersHref, isAtelierStatus,
} from "@/lib/admin-ui/ateliers-query";
import type { AdminAtelierListItem } from "@/types/ateliers";

/** /admin/ateliers: вкладки по статусу (URL), список заявок, «Одобрить» / «Отклонить» с причиной. */
export function AteliersScreen() {
  const { filters, setStatus } = useAdminAteliersFilters();
  const { status, data, meta, error, reload } = useAdminResource<AdminAtelierListItem[]>(ateliersApiUrl(filters));
  const { busyId, approve, reject } = useAdminAtelierReview(reload);
  const [rejecting, setRejecting] = useState<AdminAtelierListItem | null>(null);
  const tab = ATELIER_TABS.find((t) => t.key === filters.status) ?? ATELIER_TABS[0];

  let body;
  if (status === "error") {
    body = <AdminErrorAlert title="Не удалось загрузить заявки" description={error?.message} onRetry={reload} />;
  } else if (status === "loading" || !data) {
    body = <AteliersSkeleton />;
  } else if (data.length === 0) {
    body = <AteliersEmpty text={tab.empty} />;
  } else {
    body = (
      <>
        <AteliersTable rows={data} busyId={busyId} onApprove={(a) => void approve(a)} onReject={setRejecting} />
        <AteliersCardList rows={data} busyId={busyId} onApprove={(a) => void approve(a)} onReject={setRejecting} />
        {meta && (
          <AdminPagination
            page={meta.page}
            total={meta.total}
            perPage={meta.per_page || ATELIERS_PER_PAGE}
            hrefFor={(page) => ateliersHref({ ...filters, page })}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto pb-1">
        <Tabs value={filters.status} onValueChange={(v) => isAtelierStatus(v) && setStatus(v)}>
          <TabsList aria-label="Статус заявки" className="max-md:h-13!">
            {ATELIER_TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="px-3">{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {body}
      <RejectDialog
        atelier={rejecting}
        busy={rejecting !== null && busyId === rejecting.id}
        onCancel={() => setRejecting(null)}
        onConfirm={(a, reason) => void reject(a, reason).then((done) => done && setRejecting(null))}
      />
    </div>
  );
}
