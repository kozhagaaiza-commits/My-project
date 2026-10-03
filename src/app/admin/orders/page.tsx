import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { OrdersScreen } from "@/components/admin/orders/OrdersScreen";
import { OrdersSkeleton } from "@/components/admin/orders/OrdersSkeleton";

export default function AdminOrdersPage() {
  return (
    <>
      <AdminPageHeader title="Заказы" />
      <Suspense fallback={<OrdersSkeleton />}>
        <OrdersScreen />
      </Suspense>
    </>
  );
}
