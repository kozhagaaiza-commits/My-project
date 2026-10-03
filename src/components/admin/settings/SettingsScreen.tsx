"use client";

import { AdminErrorAlert } from "@/components/admin/layout/AdminErrorAlert";
import { PricesCard } from "@/components/admin/settings/PricesCard";
import { RatesCard } from "@/components/admin/settings/RatesCard";
import { RecalcCard } from "@/components/admin/settings/RecalcCard";
import { SettingsSkeleton } from "@/components/admin/settings/SettingsSkeleton";
import { useAdminResource } from "@/hooks/use-admin-resource";
import type { AdminSettings } from "@/lib/admin-ui/types";

export function SettingsScreen() {
  const { status, data, error, reload } = useAdminResource<AdminSettings, never>("/api/admin/settings");

  if (status === "error") {
    return <AdminErrorAlert title="Не удалось загрузить настройки" description={error?.message} onRetry={reload} />;
  }
  if (!data) return <SettingsSkeleton />;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <RatesCard rates={data.rates} onRefreshed={reload} />
      <PricesCard key={data.updated_at} settings={data} onSaved={reload} />
      <RecalcCard />
    </div>
  );
}
