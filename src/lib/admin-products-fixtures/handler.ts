import { deleteImage, reorderImages, uploadImage } from "@/lib/admin-products-fixtures/images";
import {
  createProduct, deleteProduct, getProduct, listProducts, patchProduct,
} from "@/lib/admin-products-fixtures/products";
import { fail, ok, type FixtureResponse } from "@/lib/admin-products-fixtures/respond";
import type { AdminFixtureStore } from "@/lib/admin-products-fixtures/store";
import { createVehicle, deleteVehicle, listVehicles, patchVehicle } from "@/lib/admin-products-fixtures/vehicles";

export type { FixtureResponse } from "@/lib/admin-products-fixtures/respond";

export interface FixtureRequest {
  method: string;
  /** Путь вместе с query: «/api/admin/products?type=wheel_set&page=1». */
  url: string;
  /** Тело JSON (для multipart — null). */
  json: unknown;
}

/**
 * Реализация /api/admin/products*, /vehicles*, /settings, /exchange-rates/refresh в памяти по формату Блока 3.
 * Не знает про HTTP: Playwright превращает FixtureResponse в route.fulfill.
 */
export function handleAdminFixtureRequest(store: AdminFixtureStore, req: FixtureRequest): FixtureResponse {
  const url = new URL(req.url, "http://fixtures.local");
  const parts = url.pathname.replace(/^\/api\/admin\//, "").split("/").filter(Boolean);
  const [resource, id, sub, subId] = parts;
  const m = req.method.toUpperCase();

  if (resource === "settings" && m === "GET") return ok(store.settings);
  if (resource === "exchange-rates" && id === "refresh" && m === "POST") {
    store.settings.rates = { ...store.settings.rates, CNY: { rate: 11.72, date: "2026-10-01" } };
    return ok({ USD: { ...store.settings.rates.USD, inserted: false }, CNY: { rate: 11.72, date: "2026-10-01", inserted: true } });
  }
  if (resource === "products") {
    if (!id) return m === "GET" ? listProducts(store, url.searchParams) : m === "POST" ? createProduct(store, req.json) : fail(405, "FORBIDDEN", "Метод не поддерживается");
    if (!sub) {
      if (m === "GET") return getProduct(store, id);
      if (m === "PATCH") return patchProduct(store, id, req.json);
      if (m === "DELETE") return deleteProduct(store, id);
    }
    if (sub === "images") {
      if (!subId && m === "POST") return uploadImage(store, id);
      if (!subId && m === "PATCH") return reorderImages(store, id, req.json);
      if (subId && m === "DELETE") return deleteImage(store, id, subId);
    }
  }
  if (resource === "vehicles") {
    if (!id) return m === "GET" ? listVehicles(store, url.searchParams) : m === "POST" ? createVehicle(store, req.json) : fail(405, "FORBIDDEN", "Метод не поддерживается");
    if (m === "PATCH") return patchVehicle(store, id, req.json);
    if (m === "DELETE") return deleteVehicle(store, id);
  }
  return fail(404, "NOT_FOUND", "Не найдено");
}
