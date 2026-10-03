import { apiError } from "@/lib/api-error";
import type { AdminProductsDeps } from "@/lib/admin/products/deps";
import { isUuid, okJson, readJson, runAdmin, zodError } from "@/lib/admin/products/http";
import { CARBON_ONLY, checkVehicles, productNotFound, uniqueIds } from "@/lib/admin/products/write";
import { productVehiclesBody } from "@/lib/schemas/admin-products";

// PUT /api/admin/products/[id]/vehicles (Блок 3): полная замена совместимости карбоновой детали (A7).
// Для дисков совместимость считается по параметрам (find_wheels_for_vehicle) — 400.

type Ctx = { params: Promise<{ id: string }> };

async function replace(request: Request, id: string, deps: AdminProductsDeps): Promise<Response> {
  const denied = await deps.requireAdmin(request);
  if (denied) return denied;
  if (!isUuid(id)) return productNotFound();
  const parsed = productVehiclesBody.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);
  const repo = await deps.repo();
  const product = await repo.getProductStatus(id);
  if (!product) return productNotFound();
  if (product.type !== "carbon_part") return apiError("VALIDATION_ERROR", CARBON_ONLY, 400);
  const ids = uniqueIds(parsed.data.vehicle_ids);
  const bad = await checkVehicles(repo, ids, "vehicle_ids");
  if (bad) return bad;
  await repo.replaceProductVehicles(id, ids);
  return okJson({ product_id: id, vehicle_ids: ids });
}

export function createProductVehiclesHandlers(deps: AdminProductsDeps) {
  return {
    PUT: async (request: Request, { params }: Ctx) => {
      const { id } = await params;
      return runAdmin("admin.product_vehicles.put", () => replace(request, id, deps), { productId: id });
    },
  };
}
