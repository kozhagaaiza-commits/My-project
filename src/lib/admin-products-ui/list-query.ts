// Параметры списков админки в URL (searchParams): разбор на сервере страницы и сборка ссылок на клиенте.
import type { AdminProductStatus, AdminProductType } from "@/lib/admin-products-ui/types";

export type SearchParamsInput = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function parsePage(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
}

export interface ProductsFilters {
  type: AdminProductType;
  status: AdminProductStatus | null;
  q: string;
  page: number;
}

export function parseProductsFilters(sp: SearchParamsInput): ProductsFilters {
  const status = first(sp.status);
  return {
    type: first(sp.type) === "carbon_part" ? "carbon_part" : "wheel_set",
    status: status === "draft" || status === "active" || status === "archived" ? status : null,
    q: (first(sp.q) ?? "").trim().slice(0, 60),
    page: parsePage(first(sp.page)),
  };
}

/** q короче 2 символов API не принимает (adminProductsQuery) — в запрос не попадает. */
export function productsApiUrl(f: ProductsFilters): string {
  const p = new URLSearchParams({ type: f.type, page: String(f.page) });
  if (f.status) p.set("status", f.status);
  if (f.q.length >= 2) p.set("q", f.q);
  return `/api/admin/products?${p.toString()}`;
}

/** Ссылка страницы с фильтрами; значения по умолчанию в URL не пишем. */
export function productsPageHref(f: ProductsFilters): string {
  const p = new URLSearchParams();
  if (f.type === "carbon_part") p.set("type", f.type);
  if (f.status) p.set("status", f.status);
  if (f.q) p.set("q", f.q);
  if (f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `/admin/products?${s}` : "/admin/products";
}

export type VehicleMake = "Audi" | "BMW" | "Mercedes-Benz";

export interface VehiclesFilters {
  make: VehicleMake | null;
  q: string;
  page: number;
}

export function parseVehiclesFilters(sp: SearchParamsInput): VehiclesFilters {
  const make = first(sp.make);
  return {
    make: make === "Audi" || make === "BMW" || make === "Mercedes-Benz" ? make : null,
    q: (first(sp.q) ?? "").trim().slice(0, 60),
    page: parsePage(first(sp.page)),
  };
}

export function vehiclesApiUrl(f: VehiclesFilters): string {
  const p = new URLSearchParams({ page: String(f.page) });
  if (f.make) p.set("make", f.make);
  if (f.q) p.set("q", f.q);
  return `/api/admin/vehicles?${p.toString()}`;
}

export function vehiclesPageHref(f: VehiclesFilters): string {
  const p = new URLSearchParams();
  if (f.make) p.set("make", f.make);
  if (f.q) p.set("q", f.q);
  if (f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `/admin/vehicles?${s}` : "/admin/vehicles";
}
