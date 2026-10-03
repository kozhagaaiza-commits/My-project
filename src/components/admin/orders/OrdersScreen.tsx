"use client";

import { AdminErrorAlert } from "@/components/admin/layout/AdminErrorAlert";
import { AdminPagination } from "@/components/admin/layout/AdminPagination";
import { OrdersCardList } from "@/components/admin/orders/OrdersCardList";
import { OrdersEmpty } from "@/components/admin/orders/OrdersEmpty";
import { OrdersFilters } from "@/components/admin/orders/OrdersFilters";
import { OrdersSkeleton } from "@/components/admin/orders/OrdersSkeleton";
import { OrdersTable } from "@/components/admin/orders/OrdersTable";
import { useAdminOrdersFilters } from "@/hooks/use-admin-orders-filters";
import { useAdminResource } from "@/hooks/use-admin-resource";
import { ORDERS_PER_PAGE } from "@/lib/admin-ui/order-ui";
import { isSearchActive, ordersApiUrl, ordersHref } from "@/lib/admin-ui/orders-query";
import type { AdminOrderListItem } from "@/lib/admin-ui/types";

export function OrdersScreen() {
  const { filters, searchInput, onSearchChange, clearSearch, setTab, setAttention } = useAdminOrdersFilters();
  const { status, data, meta, error, reload } = useAdminResource<AdminOrderListItem[]>(ordersApiUrl(filters));

  let body;
  if (status === "error") {
    body = <AdminErrorAlert title="Не удалось загрузить заказы" description={error?.message} onRetry={reload} />;
  } else if (status === "loading" || !data) {
    body = <OrdersSkeleton />;
  } else if (data.length === 0) {
    body = <OrdersEmpty query={isSearchActive(filters.q) ? filters.q : ""} />;
  } else {
    body = (
      <>
        <OrdersTable orders={data} />
        <OrdersCardList orders={data} />
        {meta && (
          <AdminPagination
            page={meta.page}
            total={meta.total}
            perPage={meta.per_page || ORDERS_PER_PAGE}
            hrefFor={(page) => ordersHref({ ...filters, page })}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <OrdersFilters
        filters={filters}
        searchInput={searchInput}
        onSearchChange={onSearchChange}
        onClearSearch={clearSearch}
        onTabChange={setTab}
        onAttentionChange={setAttention}
      />
      {body}
    </div>
  );
}
