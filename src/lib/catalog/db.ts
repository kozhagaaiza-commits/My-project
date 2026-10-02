import "server-only";
import type { z } from "zod";
import { PUBLIC_PRODUCT_COLUMNS } from "@/lib/catalog";
import {
  VEHICLE_COLUMNS, VEHICLE_OPTION_COLUMNS, fitRow, idRow, imageRow, productIdRow, productRow, reservationItemRow,
  vehicleIdRow, vehicleOptionRow, vehicleRow,
  type FitRow, type ImageRow, type ProductRow, type ReservationItemRow, type VehicleOptionRow, type VehicleRow,
} from "@/lib/catalog/rows";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductType } from "@/types/catalog";

// Тонкий слой доступа к БД каталога. Service-role (Блок 5.10: «публичное чтение каталога»),
// всегда явный список колонок; из products — только PUBLIC_PRODUCT_COLUMNS, никогда select("*").
// Каждый ответ PostgREST проверяется Zod-схемой строки; ошибка БД → исключение (→ 500 в Route Handler).

type Db = ReturnType<typeof createAdminClient>;
interface PgResult { data: unknown; error: { message: string; code?: string } | null }

function rows<T>(schema: z.ZodType<T>, res: PgResult, scope: string): T[] {
  if (res.error) throw new Error(`${scope}: ${res.error.code ?? ""} ${res.error.message}`);
  return schema.array().parse(res.data ?? []);
}

function one<T>(schema: z.ZodType<T>, res: PgResult, scope: string): T | null {
  if (res.error) throw new Error(`${scope}: ${res.error.code ?? ""} ${res.error.message}`);
  return res.data === null ? null : schema.parse(res.data);
}

export const db = (): Db => createAdminClient();

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

export async function selectActiveProducts(c: Db, type: ProductType): Promise<ProductRow[]> {
  const res = await c.from("products").select(PUBLIC_PRODUCT_COLUMNS).eq("type", type).eq("status", "active");
  return rows(productRow, res, "products.list");
}

export async function selectProductBySlug(c: Db, slug: string): Promise<ProductRow | null> {
  const res = await c.from("products").select(PUBLIC_PRODUCT_COLUMNS).eq("slug", slug).maybeSingle();
  return one(productRow, res, "products.bySlug");
}

/** RPC find_wheels_for_vehicle: подходящие active-диски и признак колец. */
export async function rpcFindWheels(c: Db, vehicleId: string): Promise<FitRow[]> {
  return rows(fitRow, await c.rpc("find_wheels_for_vehicle", { p_vehicle_id: vehicleId }), "rpc.find_wheels_for_vehicle");
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

/**
 * Брони по списку товаров без N+1: (1) действующие брони — orders в pending_payment с reserved_until > now;
 * (2) их позиции по нужным product_id. Агрегация — sumReserved() в listing.ts.
 * Логика совпадает с SQL reserved_qty() (Блок 2.14).
 */
export async function selectReservedItems(c: Db, productIds: string[], now: Date = new Date()): Promise<ReservationItemRow[]> {
  if (productIds.length === 0) return [];
  const ordersRes = await c.from("orders").select("id").eq("status", "pending_payment").gt("reserved_until", now.toISOString());
  const orderIds = rows(idRow, ordersRes, "orders.reserved").map((r) => r.id);
  if (orderIds.length === 0) return [];
  const itemsRes = await c.from("order_items").select("product_id,quantity").in("order_id", orderIds).in("product_id", productIds);
  return rows(reservationItemRow, itemsRes, "order_items.reserved");
}

/** Фото нескольких товаров одним запросом (обложки списка) или одного (карточка). */
export async function selectImages(c: Db, productIds: string[]): Promise<ImageRow[]> {
  if (productIds.length === 0) return [];
  const res = await c.from("product_images").select("product_id,storage_path,alt,sort_order")
    .in("product_id", productIds).order("sort_order", { ascending: true });
  return rows(imageRow, res, "product_images.list");
}

