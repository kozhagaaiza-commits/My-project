// Значения формы → вход productUpsertBody; resolver, русские тексты ошибок, раскладка details.fields сервера.
import type { FieldErrors, Resolver, ResolverError, ResolverOptions, ResolverSuccess } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { parseMoneyToMinor, parseNumberField } from "@/lib/admin-products-ui/money-input";
import type { ProductFormValues, WheelFormValues } from "@/lib/admin-products-ui/product-form-values";
import { productUpsertBody, type ProductUpsertBody } from "@/lib/admin-products-ui/schemas";
import { buildPricePreview } from "@/lib/admin-products-ui/price-preview";
import type { AdminProductStatus, AdminSettings } from "@/lib/admin-products-ui/types";

type SchemaInput = z.input<typeof productUpsertBody>;

/** Обязательное число: пусто или мусор → undefined (схема: «Заполните поле» / «Введите число»). */
const req = (s: string): number | undefined => parseNumberField(s) ?? undefined;
/** Необязательное число: пусто → null, мусор → undefined. */
const opt = (s: string): number | null | undefined => parseNumberField(s);

function buildWheel(w: WheelFormValues): Record<string, unknown> {
  return {
    diameter_in: req(w.diameter_in),
    width_front_in: req(w.width_front_in),
    width_rear_in: opt(w.width_rear_in),
    et_front_mm: req(w.et_front_mm),
    et_rear_mm: opt(w.et_rear_mm),
    pcd: w.pcd.trim(),
    center_bore_mm: req(w.center_bore_mm),
    seat_type: w.seat_type === "" ? undefined : w.seat_type,
    includes_hub_rings: w.includes_hub_rings,
    includes_fasteners: w.includes_fasteners,
    construction: w.construction === "" ? undefined : w.construction,
    finish: w.finish.trim() === "" ? null : w.finish,
    weight_kg: opt(w.weight_kg),
  };
}

/** price_atelier: пусто → null; мусор → undefined (ошибка поля). */
const atelier = (s: string) => (s.trim() === "" ? null : parseMoneyToMinor(s));

export function buildProductBody(v: ProductFormValues, status: AdminProductStatus): Record<string, unknown> {
  const carbon = v.type === "carbon_part";
  const preorder = carbon || v.availability_mode === "preorder";
  return {
    type: v.type,
    slug: v.slug,
    sku: v.sku,
    title: v.title,
    manufacturer: v.manufacturer,
    description: v.description,
    status,
    availability_mode: preorder ? "preorder" : "stock",
    stock_qty: preorder ? (opt(v.stock_qty) ?? 0) : req(v.stock_qty),
    lead_time_min_days: preorder ? opt(v.lead_time_min_days) : null,
    lead_time_max_days: preorder ? opt(v.lead_time_max_days) : null,
    purchase_currency: v.purchase_currency,
    purchase_cost: parseMoneyToMinor(v.purchase_cost),
    pricing_mode: v.pricing_mode,
    price: v.pricing_mode === "manual" ? (parseMoneyToMinor(v.price) ?? null) : null,
    price_atelier: atelier(v.price_atelier),
    wheel: carbon ? null : buildWheel(v.wheel),
    warranty_months: req(v.warranty_months),
    certifications: v.certifications,
    claims_verified: v.claims_verified,
    compatible_vehicle_ids: carbon ? v.compatible_vehicle_ids : [],
  };
}

interface RawIssue {
  code?: string;
  path?: PropertyKey[];
  origin?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  divisor?: unknown;
  expected?: unknown;
  input?: unknown;
}

/** Русские тексты для правил без собственного сообщения в схеме (сообщения схемы приоритетнее). */
export function productErrorMap(i: RawIssue): string | undefined {
  const path = (i.path ?? []).join(".");
  if (path === "purchase_cost") return "Укажите закупку";
  if (path === "sku") return "Латиница, цифры и дефис, 3–40 символов";
  switch (i.code) {
    case "invalid_type":
      return i.expected === "number" && i.input !== undefined ? "Введите число" : "Заполните поле";
    case "invalid_value":
      return "Выберите значение";
    case "invalid_format":
      return "Неверный формат";
    case "not_multiple_of":
      return `Шаг ${String(i.divisor)}`;
    case "too_small":
      if (i.origin === "number") return `Не меньше ${String(i.minimum)}`;
      return i.minimum === 1 ? "Заполните поле" : `Минимум ${String(i.minimum)} симв.`;
    case "too_big":
      if (i.origin === "number") return `Не больше ${String(i.maximum)}`;
      return `Не больше ${String(i.maximum)} ${i.origin === "array" ? "элементов" : "символов"}`;
    default:
      return undefined;
  }
}

/** Контекст формы (useForm({ context })): курсы и множитель для проверки цены ателье при режиме «Авто». */
export interface ProductResolverContext {
  settings: AdminSettings | null;
}

/**
 * zodResolver(productUpsertBody) поверх значений формы (строки → числа/null). Результат — тело запроса со
 * status = "draft": реальный статус подставляет отправка. Цену ателье в режиме «Авто» сервер сравнит с расчётной
 * сам, но превью даёт ошибку до отправки.
 */
export function makeProductResolver(): Resolver<ProductFormValues, ProductResolverContext, ProductUpsertBody> {
  const base = zodResolver(productUpsertBody, { error: productErrorMap });
  return async (values, context, options) => {
    const result = await base(
      buildProductBody(values, "draft") as unknown as SchemaInput,
      context,
      options as unknown as ResolverOptions<SchemaInput>,
    );
    const fail = (errors: FieldErrors<ProductFormValues>): ResolverError<ProductFormValues> => ({ values: {}, errors });
    const errors = result.errors as unknown as FieldErrors<ProductFormValues>;
    if (Object.keys(errors).length > 0) return fail(errors);
    const body = result.values as ProductUpsertBody;
    const calc = buildPricePreview(body.purchase_cost, body.purchase_currency, (context as ProductResolverContext | undefined)?.settings ?? null);
    const auto = calc.kind === "ok" ? calc.priceKopecks : null;
    if (body.pricing_mode === "auto" && auto !== null && body.price_atelier !== null && body.price_atelier > auto) {
      return fail({ price_atelier: { type: "custom", message: "Цена ателье не может быть выше розничной" } });
    }
    const ok: ResolverSuccess<ProductUpsertBody> = { values: body, errors: {} };
    return ok;
  };
}

const FIELD_NAMES: ReadonlySet<string> = new Set([
  "type", "slug", "sku", "title", "manufacturer", "description", "availability_mode", "stock_qty",
  "lead_time_min_days", "lead_time_max_days", "purchase_currency", "purchase_cost", "pricing_mode", "price",
  "price_atelier", "warranty_months", "certifications", "claims_verified", "compatible_vehicle_ids",
  "wheel.diameter_in", "wheel.width_front_in", "wheel.width_rear_in", "wheel.et_front_mm", "wheel.et_rear_mm",
  "wheel.pcd", "wheel.center_bore_mm", "wheel.seat_type", "wheel.construction", "wheel.finish", "wheel.weight_kg",
]);

export interface ServerFieldIssue {
  name: string;
  message: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * error.details.fields: { "wheel.pcd": ["…"] } → ошибки полей формы. Ключи без поля (images, wheel, price для
 * режима «Авто») попадают в unmapped — их показывают рядом с блоком или тостом.
 */
export function splitProductFieldErrors(details: unknown): { fields: ServerFieldIssue[]; unmapped: ServerFieldIssue[] } {
  const fields: ServerFieldIssue[] = [];
  const unmapped: ServerFieldIssue[] = [];
  const raw = isRecord(details) && isRecord(details.fields) ? details.fields : {};
  for (const [name, value] of Object.entries(raw)) {
    const message = Array.isArray(value) ? value.find((m): m is string => typeof m === "string") : undefined;
    if (!message) continue;
    (FIELD_NAMES.has(name) ? fields : unmapped).push({ name, message });
  }
  return { fields, unmapped };
}
