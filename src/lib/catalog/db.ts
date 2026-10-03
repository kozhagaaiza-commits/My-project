import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { LIST_PRODUCT_COLUMNS, PUBLIC_PRODUCT_COLUMNS } from "@/lib/catalog";
import {
  VEHICLE_COLUMNS, VEHICLE_OPTION_COLUMNS, fitRow, imageRow, listProductRow, productIdRow, productRow, reservedQtyRow,
  vehicleIdRow, vehicleOptionRow, vehicleRow,
  type FitRow, type ImageRow, type ListProductRow, type ProductRow, type VehicleOptionRow, type VehicleRow,
} from "@/lib/catalog/rows";
import type { ProductType } from "@/types/catalog";

// Тонкий слой доступа к БД каталога. Клиент — service-role (Блок 5.10: «публичное чтение каталога»),
// его создаёт вызывающий код (catalog-queries.real.ts) — модуль не импортирует env и тестируется на мок-клиенте.
// Всегда явный список колонок; из products — только LIST_/PUBLIC_PRODUCT_COLUMNS, никогда select("*").
// Каждый ответ PostgREST проверяется Zod-схемой строки; ошибка БД → исключение со scope (→ 500 в Route Handler).

export type Db = SupabaseClient;
interface PgResult { data: unknown; error: { message: string; code?: string } | null }

/** Лимит max-rows PostgREST в Supabase по умолчанию: ответ длиннее молча обрезается. */
export const POSTGREST_MAX_ROWS = 1000;

export function rows<T>(schema: z.ZodType<T>, res: PgResult, scope: string): T[] {
  if (res.error) throw new Error(`${scope}: ${res.error.code ?? ""} ${res.error.message}`);
  const data = res.data ?? [];
  if (Array.isArray(data) && data.length >= POSTGREST_MAX_ROWS) {
    console.error({ scope, msg: "PostgREST max-rows reached: результат может быть обрезан", count: data.length });
  }
  return schema.array().parse(data);
}

export function one<T>(schema: z.ZodType<T>, res: PgResult, scope: string): T | null {
  if (res.error) throw new Error(`${scope}: ${res.error.code ?? ""} ${res.error.message}`);
  return res.data === null ? null : schema.parse(res.data);
}

export async function selectActiveVehicles(c: Db, filter: { make?: string; model?: string } = {}): Promise<VehicleOptionRow[]> {
  let q = c.from("vehicles").select(VEHICLE_OPTION_COLUMNS).eq("is_active", true);
  if (filter.make) q = q.eq("make", filter.make);
  if (filter.model) q = q.eq("model", filter.model);
  return rows(vehicleOptionRow, await q, "vehicles.list");
}

export async function selectActiveVehicle(c: Db, id: string): Promise<VehicleRow | null> {
  const res = await c.from("vehicles").select(VEHICLE_COLUMNS).eq("id", id).eq("is_active", true).maybeSingle();
  return one(vehicleRow, res, "vehicles.one");
}

export async function selectActiveVehiclesByIds(c: Db, ids: string[]): Promise<VehicleOptionRow[]> {
  if (ids.length === 0) return [];
  const res = await c.from("vehicles").select(VEHICLE_OPTION_COLUMNS).in("id", ids).eq("is_active", true);
  return rows(vehicleOptionRow, res, "vehicles.byIds");
}

/** Список каталога: без description (LIST_PRODUCT_COLUMNS). */
export async function selectActiveProducts(c: Db, type: ProductType): Promise<ListProductRow[]> {
  const res = await c.from("products").select(LIST_PRODUCT_COLUMNS).eq("type", type).eq("status", "active");
  return rows(listProductRow, res, "products.list");
}

/** Карточка: полный публичный набор (PUBLIC_PRODUCT_COLUMNS). */
export async function selectProductBySlug(c: Db, slug: string): Promise<ProductRow | null> {
  const res = await c.from("products").select(PUBLIC_PRODUCT_COLUMNS).eq("slug", slug).maybeSingle();
  return one(productRow, res, "products.bySlug");
}

/** RPC find_wheels_for_vehicle: подходящие active-диски и признак колец. */
export async function rpcFindWheels(c: Db, vehicleId: string): Promise<FitRow[]> {
  return rows(fitRow, await c.rpc("find_wheels_for_vehicle", { p_vehicle_id: vehicleId }), "rpc.find_wheels_for_vehicle");
}

/**
 * RPC reserved_qty_map (миграция 20261002110000): брони pending_payment с reserved_until > now(),
 * group by product_id — та же логика, что reserved_qty() (Блок 2.14), одним вызовом без длинных URL.
 * Пустой результат → пустая карта; повтор product_id (не должен случаться) суммируется.
 */
export async function rpcReservedQtyMap(c: Db): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const r of rows(reservedQtyRow, await c.rpc("reserved_qty_map"), "rpc.reserved_qty_map")) {
    map.set(r.product_id, (map.get(r.product_id) ?? 0) + r.reserved);
  }
  return map;
}

/** Карбон: product_id, совместимые с авто (product_vehicles). */
export async function selectProductIdsForVehicle(c: Db, vehicleId: string): Promise<string[]> {
  const res = await c.from("product_vehicles").select("product_id").eq("vehicle_id", vehicleId);
  return rows(productIdRow, res, "product_vehicles.byVehicle").map((r) => r.product_id);
}

export async function selectVehicleIdsForProduct(c: Db, productId: string): Promise<string[]> {
  const res = await c.from("product_vehicles").select("vehicle_id").eq("product_id", productId);
  return rows(vehicleIdRow, res, "product_vehicles.byProduct").map((r) => r.vehicle_id);
}

/** Фото нескольких товаров одним запросом (обложки страницы списка, ≤ 24 товаров) или одного (карточка). */
export async function selectImages(c: Db, productIds: string[]): Promise<ImageRow[]> {
  if (productIds.length === 0) return [];
  const res = await c.from("product_images").select("product_id,storage_path,alt,sort_order")
    .in("product_id", productIds).order("sort_order", { ascending: true });
  return rows(imageRow, res, "product_images.list");
}
