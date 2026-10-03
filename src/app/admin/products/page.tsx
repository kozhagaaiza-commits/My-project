import { ProductsView } from "@/components/admin/products/ProductsView";
import { parseProductsFilters } from "@/lib/admin-products-ui/list-query";

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  return <ProductsView filters={parseProductsFilters(await searchParams)} />;
}
