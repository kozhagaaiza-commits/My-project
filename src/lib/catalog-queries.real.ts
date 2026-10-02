import "server-only";
import { toPublicProduct, vehicleLabel } from "@/lib/catalog";
import {
  rpcFindWheels, rpcReservedQtyMap, selectActiveProducts, selectActiveVehicle, selectActiveVehicles,
  selectActiveVehiclesByIds, selectImages, selectProductBySlug, selectProductIdsForVehicle, selectVehicleIdsForProduct,
  type Db,
} from "@/lib/catalog/db";
import { buildProductDetail } from "@/lib/catalog/detail";
import { applyFilters, paginate, pickCovers, sortEntries, toEntries, toListItem } from "@/lib/catalog/listing";
import {
  currentYearMoscow, distinctMakes, distinctModels, generationsForYear, toVehicleDetail, yearsForModel,
} from "@/lib/catalog/vehicles";
import { CATALOG_PAGE_SIZE } from "@/lib/config";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CatalogQueries } from "./catalog-queries";

// Реальная реализация контракта каталога: Supabase (service-role, явные колонки) → чистые функции
// из src/lib/catalog/*. Вся бизнес-логика — там; здесь только порядок запросов.

/** Service-role клиент на вызов (Блок 5.10: публичное чтение каталога). */
const db = (): Db => createAdminClient();

export const realQueries: CatalogQueries = {
  async listMakes() {
    return distinctMakes(await selectActiveVehicles(db()));
  },

  async listModels(make) {
    return distinctModels(await selectActiveVehicles(db(), { make }));
  },

  async listYears(make, model) {
    return yearsForModel(await selectActiveVehicles(db(), { make, model }), currentYearMoscow());
  },

  async resolveVehicle(make, model, year) {
    return generationsForYear(await selectActiveVehicles(db(), { make, model }), year, currentYearMoscow());
  },

  async getVehicle(id) {
    const row = await selectActiveVehicle(db(), id);
    return row ? toVehicleDetail(row) : null;
  },

  async listProducts(query, ctx) {
    const c = db();
    const vehicle = query.vehicle ? await selectActiveVehicle(c, query.vehicle) : null;
    if (query.vehicle && !vehicle) return { kind: "vehicle_not_found" };

    // Подбор: диски — RPC find_wheels_for_vehicle (product_id → needs_hub_rings), карбон — product_vehicles.
    let fits: Map<string, boolean> | null = null;
    if (vehicle) {
      fits = query.type === "wheel_set"
        ? new Map((await rpcFindWheels(c, vehicle.id)).map((r) => [r.product_id, r.needs_hub_rings] as const))
        : new Map((await selectProductIdsForVehicle(c, vehicle.id)).map((id) => [id, false] as const));
    }

    const products = (await selectActiveProducts(c, query.type))
      .filter((p) => fits === null || fits.has(p.id))
      .map((p) => toPublicProduct(p, ctx));
    const reserved = await rpcReservedQtyMap(c);

    const entries = sortEntries(applyFilters(toEntries(products, reserved, fits, vehicle?.id ?? null), query), query.sort);
    const pageEntries = paginate(entries, query.page, CATALOG_PAGE_SIZE);
    const covers = pickCovers(await selectImages(c, pageEntries.map((e) => e.product.id)));

    return {
      kind: "ok",
      data: pageEntries.map((e) => toListItem(e, covers.get(e.product.id), env.NEXT_PUBLIC_SUPABASE_URL)),
      meta: { total: entries.length, page: query.page, per_page: CATALOG_PAGE_SIZE, vehicle_label: vehicle ? vehicleLabel(vehicle) : null },
    };
  },

  async getProductBySlug(slug, vehicleId, ctx) {
    const c = db();
    const row = await selectProductBySlug(c, slug);
    const isAdmin = ctx.isAdmin === true;
    if (!row || (row.status !== "active" && !isAdmin)) return { kind: "not_found" };
    const product = toPublicProduct(row, ctx);

    const [reserved, images, vehicle, compatibleIds] = await Promise.all([
      rpcReservedQtyMap(c),
      selectImages(c, [product.id]),
      // Неизвестный или неактивный vehicle в карточке — не ошибка: fitment = null.
      vehicleId ? selectActiveVehicle(c, vehicleId) : Promise.resolve(null),
      product.type === "carbon_part" ? selectVehicleIdsForProduct(c, product.id) : Promise.resolve<string[]>([]),
    ]);
    const compatibleVehicles = await selectActiveVehiclesByIds(c, compatibleIds);

    return {
      kind: "ok",
      data: buildProductDetail({
        product,
        reservedQty: reserved.get(product.id) ?? 0,
        images,
        vehicle,
        compatibleVehicles,
        supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
        includeStatus: isAdmin,
      }),
    };
  },

  // День 3: пишет backend-engineer (см. src/types/cart.ts).
  async getCartProducts() {
    throw new Error("not implemented");
  },
};
