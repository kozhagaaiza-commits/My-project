import { CatalogView } from "@/components/shop/catalog/CatalogView";

export default async function CarbonPage({ searchParams }: PageProps<"/carbon">) {
  return <CatalogView type="carbon_part" searchParams={await searchParams} />;
}
