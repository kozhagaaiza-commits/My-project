import Link from "next/link";
import { redirect } from "next/navigation";
import { CatalogEmpty } from "@/components/shop/catalog/CatalogEmpty";
import { CatalogFilters } from "@/components/shop/catalog/CatalogFilters";
import { CatalogHeader } from "@/components/shop/catalog/CatalogHeader";
import { CatalogPagination } from "@/components/shop/catalog/CatalogPagination";
import { FitmentBanner } from "@/components/shop/catalog/FitmentBanner";
import { ProductGrid } from "@/components/shop/catalog/ProductGrid";
import { VehicleSync } from "@/components/shop/catalog/VehicleSync";
import {
  catalogHref, parseCatalogParams, type RawSearchParams,
} from "@/components/shop/catalog/catalog-params";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getCatalogContext } from "@/lib/catalog-context";
import { getVehicle, listProducts } from "@/lib/catalog-queries";
import { env } from "@/lib/env";
import type { ProductType, VehicleDetail } from "@/types/catalog";

interface CatalogViewProps {
  type: ProductType;
  searchParams: RawSearchParams;
}

const vehicleName = (v: VehicleDetail) => `${v.make} ${v.model} ${v.generation}`;

/**
 * Общий серверный экран каталога дисков и карбона. Ошибки загрузки не перехватываются:
 * их показывает error.tsx сегмента (Alert «Не удалось загрузить каталог» + «Повторить»).
 */
export async function CatalogView({ type, searchParams }: CatalogViewProps) {
  const parsed = parseCatalogParams(type, searchParams);
  let query = parsed.query;
  let vehicleMissing = parsed.vehicleInvalid;
  const ctx = await getCatalogContext();

  let [result, vehicle] = await Promise.all([
    listProducts(query, ctx),
    query.vehicle ? getVehicle(query.vehicle) : Promise.resolve(null),
  ]);

  if (result.kind === "vehicle_not_found" || (query.vehicle && !vehicle)) {
    // Автомобиль не найден или скрыт: каталог без фильтра + toast на клиенте.
    vehicleMissing = true;
    query = { ...query, vehicle: undefined };
    vehicle = null;
    result = await listProducts(query, ctx);
  }
  if (result.kind !== "ok") throw new Error("Каталог недоступен");

  const { data, meta } = result;
  const lastPage = Math.max(1, Math.ceil(meta.total / meta.per_page));
  if (query.page > lastPage) redirect(catalogHref(type, { ...query, page: 1 }));

  const wheels = type === "wheel_set";
  const name = vehicle ? vehicleName(vehicle) : null;
  const engineerUrl = vehicle ? `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=fit_${vehicle.id}` : null;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 md:gap-6 md:px-6 md:py-8">
      {vehicleMissing ? <VehicleSync mode="not_found" /> : !query.vehicle && <VehicleSync mode="apply" />}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Главная</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{wheels ? "Диски" : "Карбон"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <CatalogHeader type={type} vehicleName={name} total={meta.total} />
      {vehicle && <FitmentBanner type={type} vehicle={vehicle} />}
      <CatalogFilters query={query} />
      {data.length === 0 ? (
        <CatalogEmpty query={query} hasFilters={parsed.hasFilters} vehicleName={name} engineerUrl={engineerUrl} />
      ) : (
        <>
          <ProductGrid type={type} products={data} vehicleId={vehicle?.id ?? null} />
          <CatalogPagination query={query} total={meta.total} perPage={meta.per_page} />
        </>
      )}
    </div>
  );
}
