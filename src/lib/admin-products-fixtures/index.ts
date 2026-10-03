import { FIXTURE_BASE_TIME, fixtureProductRecords, fixtureVehicles } from "@/lib/admin-products-fixtures/data";
import { normalizeRecords } from "@/lib/admin-products-fixtures/products";
import type { AdminFixtureStore } from "@/lib/admin-products-fixtures/store";

export { handleAdminFixtureRequest, type FixtureRequest, type FixtureResponse } from "@/lib/admin-products-fixtures/handler";
export { FIXTURE_BASE_TIME, productId, imageId } from "@/lib/admin-products-fixtures/data";
export { touchProduct } from "@/lib/admin-products-fixtures/products";
export type { AdminFixtureStore } from "@/lib/admin-products-fixtures/store";

export interface FixtureOptions {
  /** Курс CNY не загружен (RATE_NOT_LOADED у карбона с закупкой в CNY). */
  withoutCnyRate?: boolean;
  /** Пустой каталог / пустой справочник (Empty). */
  emptyProducts?: boolean;
  emptyVehicles?: boolean;
  vehiclesPerPage?: number;
}

export function createAdminFixtureStore(options: FixtureOptions = {}): AdminFixtureStore {
  const rates = { USD: { rate: 83.56, date: "2026-10-01" }, ...(options.withoutCnyRate ? {} : { CNY: { rate: 11.72, date: "2026-10-01" } }) };
  const store: AdminFixtureStore = {
    products: options.emptyProducts ? [] : fixtureProductRecords(),
    vehicles: options.emptyVehicles ? [] : fixtureVehicles(),
    settings: { markup_multiplier: 2, price_rounding_rub: 100, auto_reprice: true, reprice_threshold: 2, rates, updated_at: FIXTURE_BASE_TIME },
    vehiclesPerPage: options.vehiclesPerPage ?? 20,
    failLists: { products: 0, vehicles: 0 },
    failVehicleToggle: 0,
    delayMs: 0,
    seq: 1000,
  };
  normalizeRecords(store);
  return store;
}
