import { apiError } from "@/lib/api-error";
import type { AdminProductsDeps } from "@/lib/admin/products/deps";
import { toAdminImage } from "@/lib/admin/products/format";
import { FORM_INVALID_MESSAGE, fieldError, firstIssueMessage, isUuid, okJson, readJson, runAdmin, zodError } from "@/lib/admin/products/http";
import { EXTENSION, detectImageType, readSignature } from "@/lib/admin/products/image-signature";
import { productNotFound } from "@/lib/admin/products/write";
import { DbError } from "@/lib/orders/errors";
import { IMAGE_MAX_BYTES, imageUploadForm, imagesReorderBody } from "@/lib/schemas/admin-products";
import { z } from "zod";

// POST (загрузка, multipart) и PATCH (порядок и подписи) /api/admin/products/[id]/images — Блок 3, 5.9.5.
// Тип файла — по сигнатуре (magic bytes), заявленный type должен с ней совпадать. Файл — в Storage через
// сессионный клиент (политики 2.15), затем строка product_images; упал insert — файл удаляется (5.9.5).

type Ctx = { params: Promise<{ id: string }> };

export const IMAGES_LIMIT = 8;
const ONLY_IMAGES = "Только JPG, PNG или WebP";
const TOO_BIG = "Файл больше 5 МБ";
/** Запас на заголовки multipart и поле alt сверх 5 МБ файла. */
const MULTIPART_OVERHEAD = 64 * 1024;

async function upload(request: Request, id: string, deps: AdminProductsDeps): Promise<Response> {
  const denied = await deps.requireAdmin(request);
  if (denied) return denied;
  if (!isUuid(id)) return productNotFound();
  // Заведомо большой запрос отклоняется до чтения тела в память.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > IMAGE_MAX_BYTES + MULTIPART_OVERHEAD) return apiError("VALIDATION_ERROR", TOO_BIG, 400, { fields: { file: [TOO_BIG] } });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fieldError({ file: [ONLY_IMAGES] });
  }
  const alt = form.get("alt");
  const parsed = imageUploadForm.safeParse({ file: form.get("file"), alt: typeof alt === "string" ? alt : undefined });
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", firstIssueMessage(parsed.error), 400, { fields: z.flattenError(parsed.error).fieldErrors });
  }
  const { file } = parsed.data;
  const detected = detectImageType(await readSignature(file));
  if (detected === null || detected !== file.type) return apiError("VALIDATION_ERROR", ONLY_IMAGES, 400, { fields: { file: [ONLY_IMAGES] } });

  const repo = await deps.repo();
  if (!(await repo.getProductStatus(id))) return productNotFound();
  const count = (await repo.listImages([id])).length;
  if (count >= IMAGES_LIMIT) return imagesLimit();

  const storage = await deps.storage();
  const path = `products/${id}/${deps.randomUUID()}.${EXTENSION[detected]}`;
  await storage.upload(path, file, detected);
  try {
    const row = await repo.insertImage({ product_id: id, storage_path: path, alt: parsed.data.alt, sort_order: count });
    return okJson(toAdminImage(row, deps.supabaseUrl()), 201);
  } catch (err) {
    await storage.remove([path]).catch((e: unknown) => console.error({ scope: "admin.images.upload.rollback", productId: id, path, err: e }));
    // Триггер trg_product_images_limit (2.5): параллельная загрузка заняла восьмое место.
    if (err instanceof DbError && err.pgCode === "P0001" && /IMAGES_LIMIT/.test(err.pgMessage)) return imagesLimit();
    throw err;
  }
}

const imagesLimit = () => apiError("IMAGES_LIMIT", `У товара уже ${IMAGES_LIMIT} фото`, 409);

async function reorder(request: Request, id: string, deps: AdminProductsDeps): Promise<Response> {
  const denied = await deps.requireAdmin(request);
  if (denied) return denied;
  if (!isUuid(id)) return productNotFound();
  const parsed = imagesReorderBody.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);
  const items = parsed.data.images.map((i) => ({ ...i, id: i.id.toLowerCase() }));
  if (new Set(items.map((i) => i.id)).size !== items.length) return fieldError({ images: ["Фото указано дважды"] }, FORM_INVALID_MESSAGE);

  const repo = await deps.repo();
  if (!(await repo.getProductStatus(id))) return productNotFound();
  const own = new Set((await repo.listImages([id])).map((i) => i.id.toLowerCase()));
  const foreign = items.find((i) => !own.has(i.id));
  if (foreign) return apiError("NOT_FOUND", `Фото ${foreign.id} не принадлежит товару`, 404);

  let updated = 0;
  for (const i of items) {
    if (await repo.updateImage(id, i.id, { sort_order: i.sort_order, alt: i.alt })) updated++;
  }
  return okJson({ updated });
}

export function createAdminImagesHandlers(deps: AdminProductsDeps) {
  const withId = (scope: string, fn: (r: Request, id: string, d: AdminProductsDeps) => Promise<Response>) =>
    async (request: Request, { params }: Ctx) => {
      const { id } = await params;
      return runAdmin(scope, () => fn(request, id, deps), { productId: id });
    };
  return { POST: withId("admin.images.upload", upload), PATCH: withId("admin.images.reorder", reorder) };
}
