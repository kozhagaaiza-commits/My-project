import { apiError } from "@/lib/api-error";
import type { AdminProductsDeps } from "@/lib/admin/products/deps";
import { isUuid, okJson, runAdmin } from "@/lib/admin/products/http";
import { productNotFound } from "@/lib/admin/products/write";

// DELETE /api/admin/products/[id]/images/[imageId] (Блок 3): удалить файл из Storage, затем строку;
// у active-товара нельзя удалить единственное фото (BR-14) — 409.

type Ctx = { params: Promise<{ id: string; imageId: string }> };

/** Текста в Чертеже нет — по образцу «Товар не найден». */
export const IMAGE_NOT_FOUND = "Фото не найдено";

async function remove(request: Request, id: string, imageId: string, deps: AdminProductsDeps): Promise<Response> {
  const denied = await deps.requireAdmin(request);
  if (denied) return denied;
  if (!isUuid(id)) return productNotFound();
  if (!isUuid(imageId)) return apiError("NOT_FOUND", IMAGE_NOT_FOUND, 404);
  const repo = await deps.repo();
  const product = await repo.getProductStatus(id);
  if (!product) return productNotFound();
  const images = await repo.listImages([id]);
  const image = images.find((i) => i.id.toLowerCase() === imageId.toLowerCase());
  if (!image) return apiError("NOT_FOUND", IMAGE_NOT_FOUND, 404);
  if (product.status === "active" && images.length <= 1) {
    return apiError("CONFLICT", "Нельзя удалить единственное фото опубликованного товара", 409);
  }
  const storage = await deps.storage();
  await storage.remove([image.storage_path]);
  if (!(await repo.deleteImage(id, image.id))) return apiError("NOT_FOUND", IMAGE_NOT_FOUND, 404);
  return okJson({ deleted: true });
}

export function createAdminImageHandlers(deps: AdminProductsDeps) {
  return {
    DELETE: async (request: Request, { params }: Ctx) => {
      const { id, imageId } = await params;
      return runAdmin("admin.images.delete", () => remove(request, id, imageId, deps), { productId: id, imageId });
    },
  };
}
