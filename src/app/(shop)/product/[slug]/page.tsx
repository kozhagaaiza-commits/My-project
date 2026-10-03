import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompatibleList } from "@/components/shop/product/CompatibleList";
import { DeliveryInfo } from "@/components/shop/product/DeliveryInfo";
import { ProductGallery } from "@/components/shop/product/ProductGallery";
import { ProductInfo } from "@/components/shop/product/ProductInfo";
import { ProductVehicleSync } from "@/components/shop/product/ProductVehicleSync";
import { ProductViewGoal } from "@/components/shop/product/ProductViewGoal";
import { SpecsTable } from "@/components/shop/product/SpecsTable";
import { loadProduct } from "@/components/shop/product/load-product";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SITE_NAME } from "@/lib/config";
import { buildSpecsShort } from "@/lib/catalog";
import { env } from "@/lib/env";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RawSearchParams = Record<string, string | string[] | undefined>;

function vehicleParam(sp: RawSearchParams): { id: string; present: boolean } {
  const raw = Array.isArray(sp.vehicle) ? sp.vehicle[0] : sp.vehicle;
  return { id: raw && UUID_RE.test(raw) ? raw.toLowerCase() : "", present: Boolean(raw) };
}

export async function generateMetadata({ params, searchParams }: PageProps<"/product/[slug]">): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  try {
    const loaded = await loadProduct(slug, vehicleParam(sp).id);
    return loaded ? { title: `${loaded.product.title} — ${SITE_NAME}`, description: loaded.product.description.slice(0, 160) } : {};
  } catch {
    return {}; // сбой чтения не должен ронять метаданные — ошибку покажет error.tsx
  }
}

export default async function ProductPage({ params, searchParams }: PageProps<"/product/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const vehicle = vehicleParam(sp);
  const loaded = await loadProduct(slug, vehicle.id);
  if (!loaded) notFound();

  const { product, vehicleMissing } = loaded;
  const wheels = product.type === "wheel_set";
  const specs = product.specs;
  const specsShort = specs
    ? buildSpecsShort({
        type: product.type, diameter_in: specs.diameter_in, width_front_in: specs.width_front_in,
        width_rear_in: specs.width_rear_in, et_front_mm: specs.et_front_mm, et_rear_mm: specs.et_rear_mm,
        pcd: specs.pcd, center_bore_mm: specs.center_bore_mm,
      })
    : null;
  const engineerUrl =
    `https://t.me/${env.TELEGRAM_BOT_USERNAME}` + (product.fitment ? `?start=fit_${product.fitment.vehicle_id}` : "");
  // Автомобиль из URL не найден — убираем из адреса; в URL нет автомобиля, а в localStorage есть — подставляем.
  const sync = vehicleMissing || (vehicle.present && !vehicle.id) ? "clear" : vehicle.present ? null : "apply";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 md:gap-6 md:px-6 md:py-8">
      {sync && <ProductVehicleSync mode={sync} />}
      <ProductViewGoal productId={product.id} />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Главная</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={wheels ? "/wheels" : "/carbon"}>{wheels ? "Диски" : "Карбон"}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">{product.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid gap-6 md:grid-cols-2 md:gap-x-8 lg:grid-cols-12 lg:gap-x-10">
        <div className="md:col-start-1 md:row-start-1 lg:col-span-7">
          <ProductGallery
            images={product.images.map(({ url, alt }) => ({ url, alt }))}
            type={product.type}
            title={product.title}
          />
        </div>
        <div className="md:sticky md:top-20 md:col-start-2 md:row-span-2 md:row-start-1 md:self-start lg:col-span-5 lg:col-start-8">
          <ProductInfo product={product} specsShort={specsShort} engineerUrl={engineerUrl} />
        </div>
        <div className="flex flex-col gap-8 md:col-start-1 md:row-start-2 lg:col-span-7">
          {product.description && (
            <section aria-labelledby="description-title" className="flex flex-col gap-3">
              <h2 id="description-title" className="text-lg font-semibold">Описание</h2>
              <p className="text-sm leading-relaxed whitespace-pre-line text-silver">{product.description}</p>
            </section>
          )}
          {specs ? (
            <SpecsTable specs={specs} warrantyMonths={product.warranty_months} certifications={product.certifications} />
          ) : (
            <CompatibleList vehicles={product.compatible_vehicles ?? []} warrantyMonths={product.warranty_months} />
          )}
          <DeliveryInfo />
        </div>
      </div>
    </div>
  );
}
