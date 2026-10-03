import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { SummaryScreen } from "@/components/admin/summary/SummaryScreen";

export default function AdminSummaryPage() {
  return (
    <>
      <AdminPageHeader title="Сводка" />
      <SummaryScreen />
    </>
  );
}
