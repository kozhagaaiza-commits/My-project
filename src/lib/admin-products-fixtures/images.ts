import { carbonImage, discImage } from "@/lib/catalog-fixtures-images";
import { imagesReorderBody } from "@/lib/admin-products-ui/schemas";
import type { AdminImage } from "@/lib/admin-products-ui/types";
import type { AdminFixtureStore } from "@/lib/admin-products-fixtures/store";
import { fail, notFound, ok, type FixtureResponse } from "@/lib/admin-products-fixtures/respond";

const find = (store: AdminFixtureStore, id: string) => store.products.find((r) => r.detail.id === id);

/** POST …/images (multipart): файл не читается — в ответе демо-картинка; лимит 8 фото как в БД (IMAGES_LIMIT). */
export function uploadImage(store: AdminFixtureStore, id: string): FixtureResponse {
  const r = find(store, id);
  if (!r) return notFound("Товар не найден");
  const d = r.detail;
  if (d.images.length >= 8) return fail(409, "IMAGES_LIMIT", "У товара уже 8 фото");
  store.seq += 1;
  const image: AdminImage = {
    id: `b2000000-0000-4000-8000-${String(store.seq).padStart(12, "0")}`,
    url: d.type === "wheel_set" ? discImage("graphite", 5 + (d.images.length % 7)) : carbonImage("diffuser"),
    alt: "", sort_order: d.images.length,
  };
  d.images = [...d.images, image];
  return ok(image, 201);
}

export function reorderImages(store: AdminFixtureStore, id: string, json: unknown): FixtureResponse {
  const r = find(store, id);
  if (!r) return notFound("Товар не найден");
  const parsed = imagesReorderBody.safeParse(json);
  if (!parsed.success) return fail(400, "VALIDATION_ERROR", "Проверьте поля формы");
  const byId = new Map(r.detail.images.map((i) => [i.id, i]));
  for (const item of parsed.data.images) {
    if (!byId.has(item.id)) return notFound(`Фото ${item.id} не принадлежит товару`);
  }
  r.detail.images = parsed.data.images
    .map((item) => ({ ...(byId.get(item.id) as AdminImage), sort_order: item.sort_order, alt: item.alt }))
    .sort((a, b) => a.sort_order - b.sort_order);
  return ok({ updated: parsed.data.images.length });
}

export function deleteImage(store: AdminFixtureStore, id: string, imageId: string): FixtureResponse {
  const r = find(store, id);
  if (!r) return notFound("Товар не найден");
  if (!r.detail.images.some((i) => i.id === imageId)) return notFound("Фото не найдено");
  if (r.detail.status === "active" && r.detail.images.length === 1) {
    return fail(409, "CONFLICT", "Нельзя удалить единственное фото опубликованного товара");
  }
  r.detail.images = r.detail.images.filter((i) => i.id !== imageId);
  return ok({ deleted: true });
}
