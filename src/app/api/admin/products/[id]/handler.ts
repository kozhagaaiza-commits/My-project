import { apiError } from "@/lib/api-error";
import { formatRub } from "@/lib/money";
import type { AdminProductsDeps } from "@/lib/admin/products/deps";
import { resolveAutoPrice } from "@/lib/admin/products/auto-price";
import { toAdminDetail, toUpsertShape } from "@/lib/admin/products/format";
import { INTERNAL_MESSAGE, fieldError, isUuid, okJson, readJson, runAdmin, zodError } from "@/lib/admin/products/http";
import { canonicalTimestamp, dbTimestamp } from "@/lib/admin/products/timestamps";
import {
  ATELIER_ABOVE_RETAIL, CARBON_ONLY, TYPE_IMMUTABLE, autoPriceFailure, changedColumns, checkVehicles, photoRequired,
  productColumns, productConflict, productNotFound, uniqueIds, uniqueViolationResponse,
} from "@/lib/admin/products/write";
import { productPatchBody, productUpsertBody } from "@/lib/schemas/admin-products";

// GET / PATCH / DELETE /api/admin/products/[id] (Блок 3 «Админка — товары»; BR-09, BR-14; оптимистическая блокировка).

type Ctx = { params: Promise<{ id: string }> };

async function read(request: Request, id: string, deps: AdminProductsDeps): Promise<Response> {
  const denied = await deps.requireAdmin(request);
  if (denied) return denied;
  if (!isUuid(id)) return productNotFound();
  const repo = await deps.repo();
  const p = await repo.getProduct(id);
  if (!p) return productNotFound();
  const [vehicleIds, images, reserved] = await Promise.all([
    p.type === "carbon_part" ? repo.productVehicleIds(id) : Promise.resolve([]),
    repo.listImages([id]),
    repo.reservedQty(),
  ]);
  return okJson(toAdminDetail(p, vehicleIds, images, reserved.get(id) ?? 0, deps.supabaseUrl()));
}

async function patch(request: Request, id: string, deps: AdminProductsDeps): Promise<Response> {
  const denied = await deps.requireAdmin(request);
  if (denied) return denied;
  if (!isUuid(id)) return productNotFound();
  const parsed = productPatchBody.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);
  const { updated_at: rawUpdatedAt, ...body } = parsed.data;
  const expected = canonicalTimestamp(rawUpdatedAt);
  if (expected === null) return fieldError({ updated_at: ["Неверная метка времени"] });

  const repo = await deps.repo();
  const cur = await repo.getProduct(id);
  if (!cur) return productNotFound();
  if (body.type !== undefined && body.type !== cur.type) return fieldError({ type: [TYPE_IMMUTABLE] });
  // Ранний отказ без лишней работы; окончательная проверка — условием update (гонка между чтением и записью).
  if (dbTimestamp(cur.updated_at) !== expected) return productConflict();

  const newVehicleIds = body.compatible_vehicle_ids === undefined ? null : uniqueIds(body.compatible_vehicle_ids);
  const curVehicleIds = cur.type === "carbon_part" ? await repo.productVehicleIds(id) : [];
  const current = toUpsertShape(cur, curVehicleIds);
  const merged = { ...current, ...body, compatible_vehicle_ids: newVehicleIds ?? curVehicleIds };
  // В режиме auto цену задаёт сервер: присланная price не участвует ни в проверках, ни в записи.
  if (merged.pricing_mode === "auto") merged.price = cur.price;
  // Блок 3: «те же superRefine проверки поверх объединения с текущей записью».
  const checked = productUpsertBody.safeParse(merged);
  if (!checked.success) return zodError(checked.error);
  const m = checked.data;

  if (m.type === "wheel_set" && newVehicleIds !== null && newVehicleIds.length > 0) {
    return fieldError({ compatible_vehicle_ids: [CARBON_ONLY] });
  }
  if (m.status === "active" && (await repo.listImages([id])).length === 0) return photoRequired();
  if (m.type === "carbon_part" && newVehicleIds !== null) {
    const bad = await checkVehicles(repo, newVehicleIds, "compatible_vehicle_ids");
    if (bad) return bad;
  }

  const reprice = m.pricing_mode === "auto"
    && (cur.pricing_mode !== "auto" || m.purchase_cost !== cur.purchase_cost || m.purchase_currency !== cur.purchase_currency);
  let price = m.pricing_mode === "manual" ? (m.price as number) : cur.price;
  let calculation: string | null = null;
  if (reprice) {
    const r = await resolveAutoPrice(repo, m.purchase_currency, m.purchase_cost);
    if (!r.ok) return autoPriceFailure(r);
    price = r.price;
    calculation = r.calculation;
  }
  if (m.price_atelier !== null && m.price_atelier > price) return fieldError({ price_atelier: [ATELIER_ABOVE_RETAIL] });

  const now = deps.now().toISOString();
  const changes = changedColumns(productColumns(m, price, now), productColumns(current as typeof m, cur.price, now));
  const priceChanged = price !== cur.price || reprice;
  if (priceChanged) changes.price_updated_at = now;
  const vehiclesChanged = m.type === "carbon_part" && newVehicleIds !== null
    && JSON.stringify([...newVehicleIds].sort()) !== JSON.stringify([...curVehicleIds].sort());
  if (Object.keys(changes).length === 0 && !vehiclesChanged) {
    return okJson({ id, ...pickPatched(body, m), updated_at: dbTimestamp(cur.updated_at) });
  }
  // Смена только совместимости тоже «изменение товара»: запись status = status сдвигает updated_at (moddatetime)
  // и проходит ту же блокировку.
  const toWrite = Object.keys(changes).length > 0 ? changes : { status: m.status };

  let row;
  try {
    row = await repo.updateProduct(id, expected, toWrite);
  } catch (err) {
    const taken = await uniqueViolationResponse(err, repo, m.slug, m.sku);
    if (taken) return taken;
    throw err;
  }
  if (!row) return productConflict();
  if (vehiclesChanged && newVehicleIds !== null) {
    // Два шага не атомарны (RPC — docs/BACKLOG.md). Поля товара уже записаны и updated_at сдвинут: отдаём новый
    // updated_at в details, чтобы повтор формы не упёрся в ложный CONFLICT и дописал совместимость.
    try {
      await repo.replaceProductVehicles(id, newVehicleIds);
    } catch (err) {
      console.error({ scope: "admin.products.patch.vehicles", productId: id, err });
      return apiError("INTERNAL_ERROR", INTERNAL_MESSAGE, 500, {
        updated_at: dbTimestamp(row.updated_at), failed_fields: ["compatible_vehicle_ids"],
      });
    }
  }

  return okJson({
    id,
    ...pickPatched(body, m),
    ...(priceChanged ? { price: row.price, price_formatted: formatRub(row.price), price_updated_at: dbTimestamp(row.price_updated_at) } : {}),
    ...(calculation !== null ? { price_calculation: calculation } : {}),
    updated_at: dbTimestamp(row.updated_at),
  });
}

/** Ответ PATCH (Блок 3): id + присланные поля в нормализованном виде (slug в нижнем регистре и т. п.) + updated_at. */
function pickPatched(body: Record<string, unknown>, m: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(body)) out[key] = m[key];
  return out;
}

async function remove(request: Request, id: string, deps: AdminProductsDeps): Promise<Response> {
  const denied = await deps.requireAdmin(request);
  if (denied) return denied;
  if (!isUuid(id)) return productNotFound();
  const repo = await deps.repo();
  if (!(await repo.getProductStatus(id))) return productNotFound();
  // order_items.product_id — on delete set null: удаление не сломало бы заказы, но Чертёж требует архив (снапшот + история).
  if (await repo.hasOrderItems(id)) return apiError("CONFLICT", "Товар есть в заказах. Переведите его в архив", 409);

  const storage = await deps.storage();
  const prefix = `products/${id}`;
  const images = await repo.listImages([id]);
  const files = await storage.list(prefix).catch((err: unknown) => {
    console.error({ scope: "admin.products.delete.storage_list", productId: id, err });
    return [] as string[];
  });
  if (!(await repo.deleteProduct(id))) return productNotFound();
  // Строки product_images удалены каскадом; файлы — после строки: сбой Storage оставит только лишние файлы,
  // а не товар с битыми фото. Ошибка — в лог, ответ 200 (товара уже нет).
  const paths = [...new Set([...images.map((i) => i.storage_path), ...files])].filter((p) => p.startsWith(`${prefix}/`));
  try {
    await storage.remove(paths);
  } catch (err) {
    console.error({ scope: "admin.products.delete.storage_remove", productId: id, count: paths.length, err });
  }
  return okJson({ deleted: true });
}

export function createAdminProductHandlers(deps: AdminProductsDeps) {
  const withId = (scope: string, fn: (r: Request, id: string, d: AdminProductsDeps) => Promise<Response>) =>
    async (request: Request, { params }: Ctx) => {
      const { id } = await params;
      return runAdmin(scope, () => fn(request, id, deps), { productId: id });
    };
  return {
    GET: withId("admin.products.get", read),
    PATCH: withId("admin.products.patch", patch),
    DELETE: withId("admin.products.delete", remove),
  };
}
