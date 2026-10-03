import { OrdersCards } from "@/components/shop/account/OrdersCards";
import { OrdersEmpty } from "@/components/shop/account/OrdersEmpty";
import { OrdersError } from "@/components/shop/account/OrdersError";
import { OrdersPagination } from "@/components/shop/account/OrdersPagination";
import { OrdersTable } from "@/components/shop/account/OrdersTable";
import type { AccountOrdersPage } from "@/types/account";

interface OrdersSectionProps {
  /** null — не удалось загрузить (Error). */
  data: AccountOrdersPage | null;
}

export function OrdersSection({ data }: OrdersSectionProps) {
  return (
    <section aria-labelledby="orders-title" className="flex flex-col gap-4">
      <h2 id="orders-title" className="text-lg font-semibold">Заказы</h2>
      {data === null ? (
        <OrdersError />
      ) : data.orders.length === 0 ? (
        <OrdersEmpty />
      ) : (
        <>
          <OrdersTable orders={data.orders} />
          <OrdersCards orders={data.orders} />
          <OrdersPagination page={data.page} total={data.total} perPage={data.per_page} />
        </>
      )}
    </section>
  );
}
