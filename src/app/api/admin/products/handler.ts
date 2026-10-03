import { formatRub } from "@/lib/money";
import type { AdminProductsDeps } from "@/lib/admin/products/deps";
import { resolveAutoPrice } from "@/lib/admin/products/auto-price";
import { toAdminListItem } from "@/lib/admin/products/format";
import { ADMIN_PAGE_SIZE, fieldError, okJson, queryObject, readJson, runAdmin, zodError } from "@/lib/admin/products/http";
import type { AdminImageRow } from "@/lib/admin/products/rows";
import { dbTimestamp } from "@/lib/admin/products/timestamps";
import {
  ATELIER_ABOVE_RETAIL, CARBON_ONLY, autoPriceFailure, checkVehicles, photoRequired, productColumns, uniqueIds,
  uniqueViolationResponse,
} from "@/lib/admin/products/write";
import { adminProductsQuery, productUpsertBody } from "@/lib/schemas/admin-products";

// GET /api/admin/products (список) и POST /api/admin/products (создание) — Блок 3 «Админка — товары», US-006.
// Зависимости внедряются (route.ts — реальные). Порядок: админ (401/403, Origin на мутациях, 300/60 с) → вход (Zod)
// → проверки сервера → БД.

async function list(request: Request, deps: AdminProductsDeps): Promise<Response> {
  const denied = await deps.requireAdmin(request);
  if (denied) return denied;
  const parsed = adminProductsQuery.safeParse(queryObject(request.url));
  if (!parsed.success) return zodError(parsed.error, "Неверные параметры запроса");
  const q = parsed.data;
  const repo = await deps.repo();
  const { rows, total } = await repo.listProducts({ type: q.type, status: q.status, q: q.q, page: q.page, perPage: ADMIN_PAGE_SIZE });
  const [images, reserved] = rows.length === 0
    ? [[] as AdminImageRow[], new Map<string, number>()]
    : await Promise.all([repo.listImages(rows.map((r) => r.id)), repo.reservedQty()]);
  const byProduct = new Map<string, AdminImageRow[]>();
  for (const i of images) byProduct.set(i.product_id, [...(byProduct.get(i.product_id) ?? []), i]);
  const data = rows.map((r) => toAdminListItem(r, reserved.get(r.id) ?? 0, byProduct.get(r.id) ?? [], deps.supabaseUrl()));
  return okJson(data, 200, { total, page: q.page, per_page: ADMIN_PAGE_SIZE });
}

async function create(request: Request, deps: AdminProductsDeps): Promise<Response> {
  const denied = await deps.requireAdmin(request);
  if (denied) return denied;
  const parsed = productUpsertBody.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);
  const b = parsed.data;
  const vehicleIds = uniqueIds(b.compatible_vehicle_ids);
  if (b.type === "wheel_set" && vehicleIds.length > 0) return fieldError({ compatible_vehicle_ids: [CARBON_ONLY] });
  // Блок 3: при создании фото ещё нет — товар сохраняется черновиком, публикация — через PATCH (BR-14).
  if (b.status === "active") return photoRequired();

  const repo = await deps.repo();
  const badVehicles = await checkVehicles(repo, vehicleIds, "compatible_vehicle_ids");
  if (badVehicles) return badVehicles;

  let price: number;
  let calculation: string | null = null;
  if (b.pricing_mode === "auto") {
    const r = await resolveAutoPrice(repo, b.purchase_currency, b.purchase_cost);
    if (!r.ok) return autoPriceFailure(r);
    price = r.price;
    calculation = r.calculation;
  } else {
    // superRefine гарантирует price для manual.
    price = b.price as number;
  }
  // Для auto superRefine не видит цену (price = null) — BR-09 проверяется по рассчитанной.
  if (b.price_atelier !== null && b.price_atelier > price) return fieldError({ price_atelier: [ATELIER_ABOVE_RETAIL] });

  let created;
  try {
    created = await repo.insertProduct(productColumns(b, price, deps.now().toISOString()));
  } catch (err) {
    const taken = await uniqueViolationResponse(err, repo, b.slug, b.sku);
    if (taken) return taken;
    throw err;
  }

  if (b.type === "carbon_part" && vehicleIds.length > 0) {
    try {
      await repo.replaceProductVehicles(created.id, vehicleIds);
    } catch (err) {
      // Компенсация: без привязок товар не создаём (повтор формы иначе упрётся в SLUG_TAKEN на свой же черновик).
      await repo.deleteProduct(created.id).catch((e: unknown) => console.error({ scope: "admin.products.create.rollback", productId: created.id, err: e }));
      throw err;
    }
  }

  return okJson({
    id: created.id, slug: created.slug, status: created.status,
    price: created.price, price_formatted: formatRub(created.price), price_calculation: calculation,
    updated_at: dbTimestamp(created.updated_at),
  }, 201);
}

export function createAdminProductsHandlers(deps: AdminProductsDeps) {
  return {
    GET: (request: Request) => runAdmin("admin.products.list", () => list(request, deps)),
    POST: (request: Request) => runAdmin("admin.products.create", () => create(request, deps)),
  };
}
