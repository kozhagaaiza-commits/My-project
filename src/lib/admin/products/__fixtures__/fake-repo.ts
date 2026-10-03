import { DbError } from "@/lib/orders/errors";
import type { RequireAdmin } from "@/lib/admin/products/auth";
import type { AdminProductsDeps } from "@/lib/admin/products/deps";
import type { AdminProductsRepo, ImageStorage, NewImage, ProductColumns } from "@/lib/admin/products/repo";
import type { AdminImageRow, AdminProductRow, PricingSettings, RateRow } from "@/lib/admin/products/rows";
import { canonicalTimestamp } from "@/lib/admin/products/timestamps";

// In-memory подмена БД и Storage админки товаров для node:test (без Supabase). Повторяет ограничения Блока 2,
// от которых зависит логика: unique slug/sku (23505 с именем ограничения, как PostgREST), триггер лимита 8 фото
// (P0001 IMAGES_LIMIT), moddatetime (updated_at с микросекундами в формате PostgREST «…+00:00»),
// условие update … where updated_at = $2.

export const P1 = "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51";
export const C1 = "a3e9c1b7-2d4f-4e8a-b6c0-1f7d9e3a5b28";
export const V1 = "c8b2e5d1-7f3a-4c9e-a1d6-4b0e8f2c7a95";
export const V2 = "6f2d8a41-9c3e-4b75-a0d2-3e8f1c7b9d64";
export const IMG1 = "2b9c1d7e-0a4f-4c3e-8d21-7f5e6a9b0c13";
export const IMG2 = "9f4e2d1c-3b7a-4e6f-b0a8-5c2d7e1f3a96";
export const NEW_ID = "4d7e1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b";
export const SUPABASE_URL = "https://abcdefghijklmnop.supabase.co";
export const T0 = "2026-10-01T09:05:00.123456+00:00";
export const T0_CANON = "2026-10-01T09:05:00.123456Z";

export function wheelProduct(over: Partial<AdminProductRow> = {}): AdminProductRow {
  return {
    id: P1, type: "wheel_set", slug: "forged-m01-r20-5x112-graphite", sku: "FCF-M01-2085-GR",
    title: "Кованый моноблок M-01 R20, 5×112, графит", manufacturer: "ForgeCarbon Forged",
    description: "Кованый моноблок из алюминиевого сплава 6061-T6.", status: "draft", availability_mode: "stock",
    stock_qty: 4, lead_time_min_days: null, lead_time_max_days: null, purchase_currency: "USD", purchase_cost: 80000,
    pricing_mode: "auto", price: 13370000, price_atelier: 11800000, price_updated_at: T0,
    diameter_in: 20, width_front_in: 8.5, width_rear_in: 9.5, et_front_mm: 30, et_rear_mm: 40, pcd: "5x112",
    center_bore_mm: 66.6, seat_type: "cone60", includes_hub_rings: false, includes_fasteners: false,
    construction: "forged_monoblock", finish: "Графит, сатин", weight_kg: 9.8, warranty_months: 24,
    certifications: [], claims_verified: false, created_at: "2026-09-30T10:00:00+00:00", updated_at: T0,
    ...over,
  };
}

export function carbonProduct(over: Partial<AdminProductRow> = {}): AdminProductRow {
  return wheelProduct({
    id: C1, type: "carbon_part", slug: "bmw-g30-carbon-spoiler", sku: "FCC-G30-SP", title: "Карбоновый спойлер BMW G30",
    manufacturer: "ForgeCarbon Carbon", availability_mode: "preorder", stock_qty: 0, lead_time_min_days: 21,
    lead_time_max_days: 35, purchase_currency: "CNY", purchase_cost: 560000, price: 13130000, price_atelier: null,
    diameter_in: null, width_front_in: null, width_rear_in: null, et_front_mm: null, et_rear_mm: null, pcd: null,
    center_bore_mm: null, seat_type: null, construction: null, finish: null, weight_kg: null, warranty_months: 12,
    ...over,
  });
}

export const image = (over: Partial<AdminImageRow> = {}): AdminImageRow => ({
  id: IMG1, product_id: P1, storage_path: `products/${P1}/${IMG1}.webp`, alt: "Вид спереди", sort_order: 0, ...over,
});

type Method = keyof AdminProductsRepo;

export class FakeProductsDb implements AdminProductsRepo {
  products = new Map<string, AdminProductRow>();
  images: AdminImageRow[] = [];
  links = new Set<string>();
  vehicles = new Set<string>([V1, V2]);
  ordered = new Set<string>();
  rates = new Map<string, RateRow>([["USD", { currency: "USD", rate: 83.56, rate_date: "2026-10-01" }], ["CNY", { currency: "CNY", rate: 11.72, rate_date: "2026-10-01" }]]);
  settings: PricingSettings = { markup_multiplier: 2, price_rounding_rub: 100 };
  reserved = new Map<string, number>();
  calls: Array<[Method, ...unknown[]]> = [];
  /** Однократная ошибка метода (имитация сбоя БД). */
  failures = new Map<Method, Error>();
  private tick = 0;

  constructor(...rows: AdminProductRow[]) {
    for (const r of rows) this.products.set(r.id, { ...r });
  }

  private log(m: Method, ...args: unknown[]) {
    this.calls.push([m, ...args]);
    const f = this.failures.get(m);
    if (f) {
      this.failures.delete(m);
      throw f;
    }
  }
  called = (m: Method) => this.calls.filter((c) => c[0] === m);
  private stamp() {
    this.tick++;
    return `2026-10-01T09:41:17.${String(this.tick).padStart(6, "0")}+00:00`;
  }
  private unique(row: { id: string; slug: string; sku: string }) {
    for (const p of this.products.values()) {
      if (p.id === row.id) continue;
      if (p.slug === row.slug) throw new DbError("fake.products", "23505", `duplicate key value violates unique constraint "products_slug_key" | Key (slug)=(${row.slug}) already exists.`);
      if (p.sku === row.sku) throw new DbError("fake.products", "23505", `duplicate key value violates unique constraint "products_sku_key" | Key (sku)=(${row.sku}) already exists.`);
    }
  }
  private write(p: AdminProductRow) {
    return { id: p.id, slug: p.slug, status: p.status, price: p.price, price_updated_at: p.price_updated_at, updated_at: p.updated_at };
  }

  async listProducts(f: Parameters<AdminProductsRepo["listProducts"]>[0]) {
    this.log("listProducts", f);
    const all = [...this.products.values()].filter((p) => (!f.type || p.type === f.type) && (!f.status || p.status === f.status)
      && (!f.q || [p.title, p.sku, p.slug].some((s) => s.toLowerCase().includes(f.q!.toLowerCase()))));
    const from = (f.page - 1) * f.perPage;
    return { rows: all.slice(from, from + f.perPage), total: all.length };
  }
  async listImages(ids: string[]) {
    this.log("listImages", ids);
    return this.images.filter((i) => ids.includes(i.product_id)).sort((a, b) => a.sort_order - b.sort_order);
  }
  async reservedQty() {
    this.log("reservedQty");
    return new Map(this.reserved);
  }
  async getProduct(id: string) {
    this.log("getProduct", id);
    const p = this.products.get(id);
    return p ? { ...p } : null;
  }
  async getProductStatus(id: string) {
    this.log("getProductStatus", id);
    const p = this.products.get(id);
    return p ? { id: p.id, type: p.type, status: p.status } : null;
  }
  async productVehicleIds(productId: string) {
    this.log("productVehicleIds", productId);
    return [...this.links].filter((l) => l.startsWith(`${productId}|`)).map((l) => l.split("|")[1]).sort();
  }
  async existingVehicleIds(ids: string[]) {
    this.log("existingVehicleIds", ids);
    return ids.filter((id) => this.vehicles.has(id));
  }
  async replaceProductVehicles(productId: string, ids: string[]) {
    this.log("replaceProductVehicles", productId, ids);
    for (const l of [...this.links]) if (l.startsWith(`${productId}|`)) this.links.delete(l);
    for (const v of ids) this.links.add(`${productId}|${v}`);
  }
  async takenSlugs(base: string) {
    this.log("takenSlugs", base);
    return [...this.products.values()].map((p) => p.slug).filter((s) => s === base || s.startsWith(`${base}-`));
  }
  async insertProduct(row: ProductColumns) {
    this.log("insertProduct", row);
    const id = NEW_ID;
    this.unique({ id, slug: row.slug, sku: row.sku });
    const at = this.stamp();
    const p: AdminProductRow = { id, ...row, created_at: at, updated_at: at } as AdminProductRow;
    this.products.set(id, p);
    return this.write(p);
  }
  async updateProduct(id: string, updatedAt: string, patch: Partial<ProductColumns>) {
    this.log("updateProduct", id, updatedAt, patch);
    const p = this.products.get(id);
    if (!p || canonicalTimestamp(p.updated_at) !== updatedAt) return null;
    const next = { ...p, ...patch, updated_at: this.stamp() } as AdminProductRow;
    this.unique(next);
    this.products.set(id, next);
    return this.write(next);
  }
  async deleteProduct(id: string) {
    this.log("deleteProduct", id);
    const had = this.products.delete(id);
    this.images = this.images.filter((i) => i.product_id !== id);
    return had;
  }
  async hasOrderItems(id: string) {
    this.log("hasOrderItems", id);
    return this.ordered.has(id);
  }
  async latestRate(currency: "USD" | "CNY") {
    this.log("latestRate", currency);
    return this.rates.get(currency) ?? null;
  }
  /** История курсов для rateOnOrBefore (по умолчанию пуста: берётся текущий курс из rates, если его дата ≤ date). */
  ratesHistory: RateRow[] = [];
  async rateOnOrBefore(currency: "USD" | "CNY", date: string) {
    this.log("rateOnOrBefore", currency, date);
    const all = [...this.ratesHistory, ...(this.rates.has(currency) ? [this.rates.get(currency) as RateRow] : [])]
      .filter((r) => r.currency === currency && r.rate_date <= date)
      .sort((a, b) => (a.rate_date < b.rate_date ? 1 : -1));
    return all[0] ?? null;
  }
  async pricingSettings() {
    this.log("pricingSettings");
    return { ...this.settings };
  }
  async insertImage(row: NewImage) {
    this.log("insertImage", row);
    if (this.images.filter((i) => i.product_id === row.product_id).length >= 8) throw new DbError("fake.images", "P0001", "IMAGES_LIMIT");
    const img = { id: IMG2, ...row };
    this.images.push(img);
    return img;
  }
  async updateImage(productId: string, imageId: string, patch: { sort_order: number; alt: string }) {
    this.log("updateImage", productId, imageId, patch);
    const img = this.images.find((i) => i.id === imageId && i.product_id === productId);
    if (!img) return false;
    Object.assign(img, patch);
    return true;
  }
  async deleteImage(productId: string, imageId: string) {
    this.log("deleteImage", productId, imageId);
    const before = this.images.length;
    this.images = this.images.filter((i) => !(i.id === imageId && i.product_id === productId));
    return this.images.length < before;
  }
  async listAutoPriced() {
    this.log("listAutoPriced");
    return [...this.products.values()].filter((p) => p.pricing_mode === "auto")
      .map((p) => ({ id: p.id, title: p.title, purchase_currency: p.purchase_currency, purchase_cost: p.purchase_cost, price: p.price, price_atelier: p.price_atelier, price_updated_at: p.price_updated_at }));
  }
  async updateAutoPrice(id: string, oldPrice: number, newPrice: number, at: string) {
    this.log("updateAutoPrice", id, oldPrice, newPrice, at);
    const p = this.products.get(id);
    if (!p || p.pricing_mode !== "auto" || p.price !== oldPrice) return false;
    this.products.set(id, { ...p, price: newPrice, price_updated_at: at, updated_at: this.stamp() });
    return true;
  }
  async touchAutoPrices(ids: string[], at: string) {
    this.log("touchAutoPrices", ids, at);
    let n = 0;
    for (const id of ids) {
      const p = this.products.get(id);
      if (!p || p.pricing_mode !== "auto") continue;
      this.products.set(id, { ...p, price_updated_at: at, updated_at: this.stamp() });
      n++;
    }
    return n;
  }
}

export class FakeStorage implements ImageStorage {
  files = new Map<string, { contentType: string; size: number }>();
  calls: Array<[string, ...unknown[]]> = [];
  failures = new Map<"upload" | "remove" | "list", Error>();
  private maybeFail(m: "upload" | "remove" | "list") {
    const f = this.failures.get(m);
    if (f) {
      this.failures.delete(m);
      throw f;
    }
  }
  async upload(path: string, body: Blob, contentType: string) {
    this.calls.push(["upload", path, contentType, body.size]);
    this.maybeFail("upload");
    if (this.files.has(path)) throw new Error("The resource already exists");
    this.files.set(path, { contentType, size: body.size });
  }
  async remove(paths: string[]) {
    this.calls.push(["remove", [...paths].sort()]);
    this.maybeFail("remove");
    for (const p of paths) this.files.delete(p);
  }
  async list(prefix: string) {
    this.calls.push(["list", prefix]);
    this.maybeFail("list");
    return [...this.files.keys()].filter((k) => k.startsWith(`${prefix}/`));
  }
}

export function fakeDeps(db: FakeProductsDb, storage = new FakeStorage(), over: Partial<AdminProductsDeps> = {}) {
  const admin: { calls: Request[]; deny: Response | null } = { calls: [], deny: null };
  const requireAdmin: RequireAdmin = async (r) => {
    admin.calls.push(r);
    return admin.deny;
  };
  const deps: AdminProductsDeps = {
    requireAdmin,
    repo: async () => db,
    storage: async () => storage,
    supabaseUrl: () => SUPABASE_URL,
    now: () => new Date("2026-10-01T09:41:17.000Z"),
    randomUUID: () => IMG2,
    ...over,
  };
  return { deps, admin, db, storage };
}

export const ORIGIN = "http://localhost:3000";

export function jsonReq(method: string, path: string, body?: unknown): Request {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

export const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

export async function json(res: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
