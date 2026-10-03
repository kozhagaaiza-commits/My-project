import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { SettingsScreen } from "@/components/admin/settings/SettingsScreen";

export default function AdminSettingsPage() {
  return (
    <>
      <AdminPageHeader title="Настройки" />
      <SettingsScreen />
    </>
  );
}
