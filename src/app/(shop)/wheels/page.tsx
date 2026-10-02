import { CatalogView } from "@/components/shop/catalog/CatalogView";

export default async function WheelsPage({ searchParams }: PageProps<"/wheels">) {
  return <CatalogView type="wheel_set" searchParams={await searchParams} />;
}
