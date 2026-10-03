import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AteliersScreen } from "@/components/admin/ateliers/AteliersScreen";
import { AteliersSkeleton } from "@/components/admin/ateliers/AteliersSkeleton";
import { FEATURE_ATELIER } from "@/lib/config";

export default function AdminAteliersPage() {
  if (!FEATURE_ATELIER) notFound();
  return (
    <>
      <AdminPageHeader title="Ателье" description="Заявки на оптовые цены" />
      <Suspense fallback={<AteliersSkeleton />}>
        <AteliersScreen />
      </Suspense>
    </>
  );
}
