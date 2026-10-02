import { productsQuery } from "@/lib/schemas/catalog";
import type { ProductsQuery, ProductType } from "@/types/catalog";

export type RawSearchParams = Record<string, string | string[] | undefined>;

export const CATALOG_PATH: Record<ProductType, string> = {
  wheel_set: "/wheels",
  carbon_part: "/carbon",
};

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export interface ParsedCatalogParams {
  query: ProductsQuery;
  /** В URL был vehicle, но он не прошёл валидацию (не uuid) → показываем каталог без фильтра + toast. */
  vehicleInvalid: boolean;
  /** Активны фильтры (диаметр, конструкция, «только в наличии») — для Empty «Ничего не найдено по фильтрам». */
  hasFilters: boolean;
}

/** Разбор searchParams схемой productsQuery; невалидные поля отбрасываются, страница не падает. */
export function parseCatalogParams(type: ProductType, sp: RawSearchParams): ParsedCatalogParams {
  const wheels = type === "wheel_set";
  const raw: Record<string, string | undefined> = {
    type,
    vehicle: first(sp.vehicle),
    diameter: wheels ? first(sp.diameter) : undefined,
    construction: wheels ? first(sp.construction) : undefined,
    availability: wheels ? first(sp.availability) : undefined,
    sort: first(sp.sort),
    page: first(sp.page),
  };
  const defined = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined));

  let vehicleInvalid = false;
  let parsed = productsQuery.safeParse(defined);
  if (!parsed.success) {
    const bad = new Set(parsed.error.issues.map((i) => String(i.path[0])));
    vehicleInvalid = bad.has("vehicle");
    parsed = productsQuery.safeParse(Object.fromEntries(Object.entries(defined).filter(([k]) => !bad.has(k))));
  }
  const query: ProductsQuery = parsed.success
    ? parsed.data
    : { type, availability: "all", sort: "newest", page: 1 };

  return {
    query,
    vehicleInvalid,
    hasFilters: query.diameter !== undefined || query.construction !== undefined || query.availability === "in_stock",
  };
}

/** Ссылка каталога: значения по умолчанию в URL не пишем. */
export function catalogHref(
  type: ProductType,
  q: Partial<Pick<ProductsQuery, "vehicle" | "diameter" | "construction" | "availability" | "sort" | "page">>,
): string {
  const params = new URLSearchParams();
  if (q.vehicle) params.set("vehicle", q.vehicle);
  if (q.diameter) params.set("diameter", String(q.diameter));
  if (q.construction) params.set("construction", q.construction);
  if (q.availability === "in_stock") params.set("availability", "in_stock");
  if (q.sort && q.sort !== "newest") params.set("sort", q.sort);
  if (q.page && q.page > 1) params.set("page", String(q.page));
  const qs = params.toString();
  return `${CATALOG_PATH[type]}${qs ? `?${qs}` : ""}`;
}

/** 1 позиция, 2 позиции, 5 позиций, 14 позиций, 21 позиция. */
export function pluralPositions(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  const word = mod100 >= 11 && mod100 <= 14 ? "позиций" : mod10 === 1 ? "позиция" : mod10 >= 2 && mod10 <= 4 ? "позиции" : "позиций";
  return `${n} ${word}`;
}

export const SEAT_NOTE: Record<string, string> = {
  cone60: "конус 60°",
  ball_r13: "сфера R13",
  ball_r14: "сфера R14",
  flat: "плоская",
};
