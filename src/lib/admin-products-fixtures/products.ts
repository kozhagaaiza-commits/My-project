import { z } from "zod";
import { productUpsertBody, type ProductUpsertBody } from "@/lib/admin-products-ui/schemas";
import { buildPricePreview, computeAutoPrice, rateFor } from "@/lib/admin-products-ui/price-preview";
import type { AdminProductDetail } from "@/lib/admin-products-ui/types";
import type { AdminFixtureStore, AdminProductRecord } from "@/lib/admin-products-fixtures/store";
import { fail, isRecord, notFound, ok, toRow, type FixtureResponse } from "@/lib/admin-products-fixtures/respond";
import { productId } from "@/lib/admin-products-fixtures/data";

const PER_PAGE = 20;

/** Цена записи по текущим курсам; null — курса нет. Ручная цена возвращается как есть. */
export function priceOf(store: AdminFixtureStore, d: Pick<AdminProductDetail, "pricing_mode" | "price" | "purchase_cost" | "purchase_currency">): number | null {
  if (d.pricing_mode === "manual") return d.price;
  const rate = rateFor(d.purchase_currency, store.settings);
  return rate === null ? null : computeAutoPrice(d.purchase_cost, rate, store.settings.markup_multiplier, store.settings.price_rounding_rub);
}

/** Привести цены и доступность стартовых записей в согласованный вид. */
export function normalizeRecords(store: AdminFixtureStore): void {
  for (const r of store.products) {
    const d = r.detail;
    d.price = d.pricing_mode === "manual" ? 9_990_000 : (priceOf({ ...store, settings: { ...store.settings, rates: { USD: { rate: 83.56, date: "" }, CNY: { rate: 11.72, date: "" } } } }, d) ?? 0);
    d.available_qty = d.availability_mode === "stock" ? Math.max(d.stock_qty - d.reserved_qty, 0) : 0;
  }
}

export function listProducts(store: AdminFixtureStore, sp: URLSearchParams): FixtureResponse {
  if (store.failLists.products > 0) {
    store.failLists.products -= 1;
    return fail(500, "INTERNAL_ERROR", "Что-то пошло не так. Мы уже разбираемся");
  }
  const type = sp.get("type");
  const status = sp.get("status");
  const q = (sp.get("q") ?? "").toLowerCase();
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const rows = store.products
    .map((r) => r.detail)
    .filter((d) => (!type || d.type === type) && (!status || d.status === status)
      && (!q || d.title.toLowerCase().includes(q) || d.sku.toLowerCase().includes(q)));
  return ok(rows.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(toRow), 200, { total: rows.length, page, per_page: PER_PAGE });
}

const find = (store: AdminFixtureStore, id: string): AdminProductRecord | undefined => store.products.find((r) => r.detail.id === id);

export function getProduct(store: AdminFixtureStore, id: string): FixtureResponse {
  const r = find(store, id);
  return r ? ok(r.detail) : notFound("Товар не найден");
}

function validation(error: z.ZodError): FixtureResponse {
  return fail(400, "VALIDATION_ERROR", "Проверьте поля формы", { fields: z.flattenError(error).fieldErrors });
}

function slugTaken(store: AdminFixtureStore, slug: string, exceptId: string | null): FixtureResponse | null {
  const taken = slug === "taken-slug" || store.products.some((r) => r.detail.slug === slug && r.detail.id !== exceptId);
  return taken ? fail(409, "SLUG_TAKEN", "Такой адрес уже используется", { suggestion: `${slug}-2` }) : null;
}

const skuTaken = (store: AdminFixtureStore, sku: string, exceptId: string | null): FixtureResponse | null =>
  store.products.some((r) => r.detail.sku === sku && r.detail.id !== exceptId)
    ? fail(409, "SKU_TAKEN", `Артикул ${sku} уже есть в каталоге`)
    : null;

function noRate(body: ProductUpsertBody): FixtureResponse {
  return fail(422, "RATE_NOT_LOADED", `Курс ${body.purchase_currency} не загружен. Загрузите курс или задайте цену вручную`);
}

export function createProduct(store: AdminFixtureStore, json: unknown): FixtureResponse {
  const parsed = productUpsertBody.safeParse(json);
  if (!parsed.success) return validation(parsed.error);
  const b = parsed.data;
  const conflict = slugTaken(store, b.slug, null) ?? skuTaken(store, b.sku, null);
  if (conflict) return conflict;
  const price = priceOf(store, { ...b, price: b.price });
  if (price === null) return noRate(b);
  store.seq += 1;
  const now = new Date(Date.parse("2026-10-02T10:00:00.000Z") + store.seq * 1000).toISOString();
  const detail: AdminProductDetail = {
    ...b, id: productId(store.seq), status: "draft", price, price_updated_at: now, reserved_qty: 0,
    available_qty: b.availability_mode === "stock" ? b.stock_qty : 0, images: [], created_at: now, updated_at: now,
  };
  store.products.unshift({ detail, in_orders: false });
  const preview = buildPricePreview(b.purchase_cost, b.purchase_currency, store.settings);
  return ok({
    id: detail.id, slug: detail.slug, status: "draft", price, price_formatted: toRow(detail).price_formatted,
    price_calculation: preview.kind === "ok" ? preview.line : undefined,
  }, 201);
}

export function patchProduct(store: AdminFixtureStore, id: string, json: unknown): FixtureResponse {
  const r = find(store, id);
  if (!r) return notFound("Товар не найден");
  if (!isRecord(json) || typeof json.updated_at !== "string") return fail(400, "VALIDATION_ERROR", "Проверьте поля формы");
  if (json.updated_at !== r.detail.updated_at) return fail(409, "CONFLICT", "Товар изменили в другой вкладке. Обновите страницу");
  const { updated_at: _ignored, ...rest } = json;
  void _ignored;
  const { images, id: _id, ...current } = r.detail;
  void images; void _id;
  const parsed = productUpsertBody.safeParse({ ...current, ...rest });
  if (!parsed.success) return validation(parsed.error);
  const b = parsed.data;
  const conflict = slugTaken(store, b.slug, id) ?? skuTaken(store, b.sku, id);
  if (conflict) return conflict;
  if (b.status === "active" && r.detail.images.length === 0) {
    return fail(400, "VALIDATION_ERROR", "Добавьте хотя бы одно фото", { fields: { images: ["Добавьте хотя бы одно фото"] } });
  }
  const price = priceOf(store, b);
  if (price === null) return noRate(b);
  store.seq += 1;
  const updated_at = new Date(Date.parse("2026-10-02T11:00:00.000Z") + store.seq * 1000).toISOString();
  r.detail = { ...r.detail, ...b, price, updated_at, available_qty: b.availability_mode === "stock" ? Math.max(b.stock_qty - r.detail.reserved_qty, 0) : 0 };
  return ok({ id, status: b.status, stock_qty: b.stock_qty, updated_at });
}

export function deleteProduct(store: AdminFixtureStore, id: string): FixtureResponse {
  const r = find(store, id);
  if (!r) return notFound("Товар не найден");
  if (r.in_orders) return fail(409, "CONFLICT", "Товар есть в заказах. Переведите его в архив");
  store.products = store.products.filter((x) => x !== r);
  return ok({ deleted: true });
}

/** Имитация правки в другой вкладке: меняет updated_at, и следующий PATCH получит 409 CONFLICT. */
export function touchProduct(store: AdminFixtureStore, id: string): void {
  const r = find(store, id);
  if (r) r.detail = { ...r.detail, updated_at: "2026-10-02T12:00:00.000Z" };
}
