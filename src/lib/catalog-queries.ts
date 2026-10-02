import "server-only";
import type {
  CatalogContext, ListProductsResult, ProductDetailResult, ProductsQuery, VehicleDetail, VehicleOption,
} from "@/types/catalog";

// КОНТРАКТ Дня 2. Страницы (Server Components) и Route Handlers (/api/vehicles/*, /api/products*)
// вызывают ТОЛЬКО эти функции — без HTTP-запросов к самим себе.
//   catalog-queries.real.ts      — Supabase через service-role с явным списком колонок (пишет backend-engineer)
//   catalog-queries.fixtures.ts  — демо-данные для разработки без доступа к Supabase (пишет frontend-developer);
//                                  включается ТОЛЬКО при CATALOG_FIXTURES=1 и NODE_ENV !== "production".
export interface CatalogQueries {
  listMakes(): Promise<string[]>;
  listModels(make: string): Promise<string[]>;
  /** null — у модели нет активных записей (→ 404 «Модель не найдена»). */
  listYears(make: string, model: string): Promise<number[] | null>;
  /** Поколения, выпускавшиеся в указанный год (пустой массив → 404). */
  resolveVehicle(make: string, model: string, year: number): Promise<VehicleOption[]>;
  getVehicle(id: string): Promise<VehicleDetail | null>;
  listProducts(query: ProductsQuery, ctx: CatalogContext): Promise<ListProductsResult>;
  getProductBySlug(slug: string, vehicleId: string | undefined, ctx: CatalogContext): Promise<ProductDetailResult>;
}

// Условие записано прямо в выражении: в production-сборке process.env.NODE_ENV заменяется на "production",
// левая часть становится false, и бандлер вырезает ветку с import фикстур (они не попадают в .next/server).
const impl = async (): Promise<CatalogQueries> =>
  process.env.NODE_ENV !== "production" && process.env.CATALOG_FIXTURES === "1"
    ? (await import("./catalog-queries.fixtures")).fixtureQueries
    : (await import("./catalog-queries.real")).realQueries;

export const listMakes: CatalogQueries["listMakes"] = async () => (await impl()).listMakes();
export const listModels: CatalogQueries["listModels"] = async (make) => (await impl()).listModels(make);
export const listYears: CatalogQueries["listYears"] = async (make, model) => (await impl()).listYears(make, model);
export const resolveVehicle: CatalogQueries["resolveVehicle"] = async (make, model, year) => (await impl()).resolveVehicle(make, model, year);
export const getVehicle: CatalogQueries["getVehicle"] = async (id) => (await impl()).getVehicle(id);
export const listProducts: CatalogQueries["listProducts"] = async (query, ctx) => (await impl()).listProducts(query, ctx);
export const getProductBySlug: CatalogQueries["getProductBySlug"] = async (slug, vehicleId, ctx) => (await impl()).getProductBySlug(slug, vehicleId, ctx);
