import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { DbError } from "@/lib/orders/errors";
import type { AdminProductsRepo, ImageStorage, ProductColumns } from "./repo";
import {
  ADMIN_LIST_COLUMNS, ADMIN_PRODUCT_COLUMNS, AUTO_PRICE_COLUMNS, IMAGE_COLUMNS, PRICING_SETTINGS_COLUMNS,
  PRODUCT_WRITE_RETURN_COLUMNS, RATE_COLUMNS, adminListRow, adminProductRow, autoPriceRow, idRow, imageRow,
  pricingSettingsRow, productStatusRow, productWriteRow, rateRow, reservedRow, slugRow, vehicleLinkRow,
} from "./rows";

// Реальный AdminProductsRepo/ImageStorage. Сессионный клиент (RLS: products/product_images/product_vehicles/
// exchange_rates/app_settings/order_items — select/insert/update/delete только is_admin()).
// Service-role (`service()`) — только RPC reserved_qty_map: она выдана одному service_role (2.19), а вызов идёт
// ПОСЛЕ проверки роли admin (5.10 «админские эндпоинты»). Всегда явные списки колонок, никогда select("*").

export const PRODUCT_IMAGES_BUCKET = "product-images";

interface PgError { message: string; code?: string; details?: string | null; hint?: string | null }
interface PgResult { data: unknown; error: PgError | null; count?: number | null }

function fail(scope: string, error: PgError): never {
  throw new DbError(scope, error.code || undefined, [error.message, error.details].filter(Boolean).join(" | "));
}

function list<T>(schema: z.ZodType<T>, res: PgResult, scope: string): T[] {
  if (res.error) fail(scope, res.error);
  return schema.array().parse(res.data ?? []);
}

function maybe<T>(schema: z.ZodType<T>, res: PgResult, scope: string): T | null {
  if (res.error) fail(scope, res.error);
  return res.data === null || res.data === undefined ? null : schema.parse(res.data);
}

function done(res: PgResult, scope: string): void {
  if (res.error) fail(scope, res.error);
}

/**
 * Подстрока поиска для PostgREST `or=(…ilike…)`: символы синтаксиса фильтра (`,()"\`) и шаблонов LIKE (`%*`)
 * заменяются на `_` (любой один символ) — поиск «R20, 5×112» по-прежнему находит «R20, 5×112».
 */
export const ilikeTerm = (q: string) => q.replace(/[%*,()"\\]/g, "_");

export function createAdminProductsRepo(c: SupabaseClient, service: () => SupabaseClient): AdminProductsRepo {
  return {
    async listProducts(f) {
      let q = c.from("products").select(ADMIN_LIST_COLUMNS, { count: "exact" });
      if (f.type) q = q.eq("type", f.type);
      if (f.status) q = q.eq("status", f.status);
      if (f.q) {
        const t = ilikeTerm(f.q);
        q = q.or(`title.ilike.%${t}%,sku.ilike.%${t}%,slug.ilike.%${t}%`);
      }
      const from = (f.page - 1) * f.perPage;
      const res = await q.order("created_at", { ascending: false }).order("id").range(from, from + f.perPage - 1);
      return { rows: list(adminListRow, res, "admin.products.list"), total: res.count ?? 0 };
    },

    async listImages(ids) {
      if (ids.length === 0) return [];
      const res = await c.from("product_images").select(IMAGE_COLUMNS).in("product_id", ids)
        .order("sort_order").order("id");
      return list(imageRow, res, "admin.products.images");
    },

    async reservedQty() {
      const map = new Map<string, number>();
      for (const r of list(reservedRow, await service().rpc("reserved_qty_map"), "admin.rpc.reserved_qty_map")) {
        map.set(r.product_id, (map.get(r.product_id) ?? 0) + r.reserved);
      }
      return map;
    },

    async getProduct(id) {
      const res = await c.from("products").select(ADMIN_PRODUCT_COLUMNS).eq("id", id).maybeSingle();
      return maybe(adminProductRow, res, "admin.products.one");
    },

    async getProductStatus(id) {
      const res = await c.from("products").select("id,type,status").eq("id", id).maybeSingle();
      return maybe(productStatusRow, res, "admin.products.status");
    },

    async productVehicleIds(productId) {
      const res = await c.from("product_vehicles").select("vehicle_id").eq("product_id", productId).order("vehicle_id");
      return list(vehicleLinkRow, res, "admin.product_vehicles.list").map((r) => r.vehicle_id);
    },

    async existingVehicleIds(ids) {
      if (ids.length === 0) return [];
      const res = await c.from("vehicles").select("id").in("id", ids);
      return list(idRow, res, "admin.vehicles.exist").map((r) => r.id);
    },

    async replaceProductVehicles(productId, vehicleIds) {
      if (vehicleIds.length > 0) {
        const rows = vehicleIds.map((vehicle_id) => ({ product_id: productId, vehicle_id }));
        done(await c.from("product_vehicles").upsert(rows, { onConflict: "product_id,vehicle_id", ignoreDuplicates: true }),
          "admin.product_vehicles.upsert");
        done(await c.from("product_vehicles").delete().eq("product_id", productId).notIn("vehicle_id", vehicleIds),
          "admin.product_vehicles.prune");
      } else {
        done(await c.from("product_vehicles").delete().eq("product_id", productId), "admin.product_vehicles.clear");
      }
    },

    async takenSlugs(base) {
      // base уже прошёл regex slug (латиница, цифры, дефис) — безопасен в синтаксисе or=().
      const res = await c.from("products").select("slug").or(`slug.eq.${base},slug.like.${base}-*`).limit(1000);
      return list(slugRow, res, "admin.products.slugs").map((r) => r.slug);
    },

    async insertProduct(row: ProductColumns) {
      const res = await c.from("products").insert(row).select(PRODUCT_WRITE_RETURN_COLUMNS).single();
      const out = maybe(productWriteRow, res, "admin.products.insert");
      if (!out) throw new Error("admin.products.insert: пустой ответ");
      return out;
    },

    async updateProduct(id, updatedAt, patch) {
      const res = await c.from("products").update(patch).eq("id", id).eq("updated_at", updatedAt)
        .select(PRODUCT_WRITE_RETURN_COLUMNS).maybeSingle();
      return maybe(productWriteRow, res, "admin.products.update");
    },

    async deleteProduct(id) {
      const res = await c.from("products").delete().eq("id", id).select("id");
      return list(idRow, res, "admin.products.delete").length > 0;
    },

    async hasOrderItems(productId) {
      const res = await c.from("order_items").select("id").eq("product_id", productId).limit(1);
      return list(idRow, res, "admin.order_items.exists").length > 0;
    },

    async latestRate(currency) {
      const res = await c.from("exchange_rates").select(RATE_COLUMNS).eq("currency", currency)
        .order("rate_date", { ascending: false }).limit(1).maybeSingle();
      return maybe(rateRow, res, "admin.exchange_rates.latest");
    },

    async rateOnOrBefore(currency, date) {
      const res = await c.from("exchange_rates").select(RATE_COLUMNS).eq("currency", currency).lte("rate_date", date)
        .order("rate_date", { ascending: false }).limit(1).maybeSingle();
      return maybe(rateRow, res, "admin.exchange_rates.onOrBefore");
    },

    async pricingSettings() {
      const res = await c.from("app_settings").select(PRICING_SETTINGS_COLUMNS).eq("id", 1).single();
      const s = maybe(pricingSettingsRow, res, "admin.app_settings.pricing");
      if (!s) throw new Error("admin.app_settings.pricing: строка id = 1 не найдена");
      return s;
    },

    async insertImage(row) {
      const res = await c.from("product_images").insert(row).select(IMAGE_COLUMNS).single();
      const out = maybe(imageRow, res, "admin.product_images.insert");
      if (!out) throw new Error("admin.product_images.insert: пустой ответ");
      return out;
    },

    async updateImage(productId, imageId, patch) {
      const res = await c.from("product_images").update(patch).eq("id", imageId).eq("product_id", productId).select("id");
      return list(idRow, res, "admin.product_images.update").length > 0;
    },

    async deleteImage(productId, imageId) {
      const res = await c.from("product_images").delete().eq("id", imageId).eq("product_id", productId).select("id");
      return list(idRow, res, "admin.product_images.delete").length > 0;
    },

    async listAutoPriced() {
      const res = await c.from("products").select(AUTO_PRICE_COLUMNS).eq("pricing_mode", "auto").order("title").order("id");
      return list(autoPriceRow, res, "admin.products.auto");
    },

    async updateAutoPrice(id, oldPrice, newPrice, at) {
      const res = await c.from("products").update({ price: newPrice, price_updated_at: at })
        .eq("id", id).eq("pricing_mode", "auto").eq("price", oldPrice).select("id");
      return list(idRow, res, "admin.products.reprice").length > 0;
    },

    async touchAutoPrices(ids, at) {
      if (ids.length === 0) return 0;
      const res = await c.from("products").update({ price_updated_at: at })
        .in("id", ids).eq("pricing_mode", "auto").select("id");
      return list(idRow, res, "admin.products.reprice_touch").length;
    },
  };
}

/** Storage бакета product-images через сессионный клиент (политики storage.objects 2.15 — только admin). */
export function createImageStorage(c: SupabaseClient): ImageStorage {
  const bucket = () => c.storage.from(PRODUCT_IMAGES_BUCKET);
  return {
    async upload(path, body, contentType) {
      const { error } = await bucket().upload(path, body, { contentType, upsert: false, cacheControl: "31536000" });
      if (error) throw new Error(`admin.storage.upload: ${error.message}`);
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket().remove(paths);
      if (error) throw new Error(`admin.storage.remove: ${error.message}`);
    },
    async list(prefix) {
      const { data, error } = await bucket().list(prefix, { limit: 1000 });
      if (error) throw new Error(`admin.storage.list: ${error.message}`);
      return (data ?? []).filter((o) => o.id !== null).map((o) => `${prefix}/${o.name}`);
    },
  };
}
