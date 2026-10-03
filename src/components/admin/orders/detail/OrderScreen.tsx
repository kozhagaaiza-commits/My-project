"use client";

import Link from "next/link";
import { AdminErrorAlert } from "@/components/admin/layout/AdminErrorAlert";
import { OrderSkeleton } from "@/components/admin/orders/detail/OrderSkeleton";
import { OrderView } from "@/components/admin/orders/detail/OrderView";
import { Button } from "@/components/ui/button";
import { useAdminResource } from "@/hooks/use-admin-resource";
import type { AdminOrderDetail } from "@/lib/admin-ui/types";

export function OrderScreen({ id }: { id: string }) {
  const { status, data, error, reload } = useAdminResource<AdminOrderDetail, never>(
    `/api/admin/orders/${encodeURIComponent(id)}`,
  );

  if (status === "error") {
    if (error?.status === 404) {
      return (
        <div className="flex flex-col items-center gap-6 py-16 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Заказ не найден</h1>
          <Button asChild variant="outline">
            <Link href="/admin/orders">К списку</Link>
          </Button>
        </div>
      );
    }
    return <AdminErrorAlert title="Не удалось загрузить заказ" description={error?.message} onRetry={reload} />;
  }
  if (!data) return <OrderSkeleton />;
  return <OrderView order={data} reload={reload} />;
}
