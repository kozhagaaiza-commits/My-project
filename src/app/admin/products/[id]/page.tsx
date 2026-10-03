import { notFound } from "next/navigation";
import { ProductFormView } from "@/components/admin/products/ProductFormView";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminEditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  return <ProductFormView productId={id.toLowerCase()} />;
}
