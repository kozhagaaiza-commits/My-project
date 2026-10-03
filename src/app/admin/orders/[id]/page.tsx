import { OrderScreen } from "@/components/admin/orders/detail/OrderScreen";

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  return <OrderScreen id={id} />;
}
