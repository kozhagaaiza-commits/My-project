import {
  CONSTRUCTION_LABELS, SEAT_TYPE_LABELS, buildAvailability, buildFastenerNote, formatPrice, soldAs,
  toProductImage, vehicleLabel,
} from "@/lib/catalog";
import { wheelFitsVehicle } from "@/lib/catalog/fitment";
import type { ImageRow, PublicProductRow, VehicleOptionRow, VehicleRow } from "@/lib/catalog/rows";
import { formatRub } from "@/lib/money";
import type { DetailFitment, ProductDetail, ProductSpecs } from "@/types/catalog";

// Чистая сборка ответа GET /api/products/[slug] (Блок 3 «Каталог», US-002).

export function buildSpecs(p: PublicProductRow): ProductSpecs | null {
  if (p.type !== "wheel_set" || p.diameter_in === null || p.width_front_in === null || p.et_front_mm === null
    || p.pcd === null || p.center_bore_mm === null || p.seat_type === null || p.construction === null) return null;
  return {
    diameter_in: p.diameter_in, width_front_in: p.width_front_in, width_rear_in: p.width_rear_in,
    et_front_mm: p.et_front_mm, et_rear_mm: p.et_rear_mm, pcd: p.pcd, center_bore_mm: p.center_bore_mm,
    seat_type: p.seat_type, seat_type_label: SEAT_TYPE_LABELS[p.seat_type],
    construction: p.construction, construction_label: CONSTRUCTION_LABELS[p.construction],
    finish: p.finish, weight_kg: p.weight_kg,
    includes_hub_rings: p.includes_hub_rings, includes_fasteners: p.includes_fasteners,
  };
}

/**
 * Блок совместимости. Диск — правила find_wheels_for_vehicle; карбон — наличие vehicle в product_vehicles.
 * vehicle = null (не передан, не найден или неактивен) → fitment = null, это не ошибка.
 */
export function buildDetailFitment(
  p: PublicProductRow,
  vehicle: VehicleRow | null,
  compatibleVehicleIds: ReadonlySet<string>,
): DetailFitment | null {
  if (!vehicle) return null;
  const wheel = p.type === "wheel_set" ? wheelFitsVehicle(p, vehicle) : null;
  const fits = wheel ? wheel.fits : compatibleVehicleIds.has(vehicle.id);
  return {
    vehicle_id: vehicle.id,
    vehicle_label: vehicleLabel(vehicle),
    fits,
    needs_hub_rings: wheel?.needs_hub_rings ?? false,
    fastener_note: buildFastenerNote(p, vehicle, fits),
  };
}

export interface DetailInput {
  product: PublicProductRow;
  reservedQty: number;
  images: ImageRow[];
  vehicle: VehicleRow | null;
  compatibleVehicles: VehicleOptionRow[];
  supabaseUrl: string;
  /** Только для admin: статус товара (draft/archived карточки видны админу). */
  includeStatus: boolean;
}

export function buildProductDetail(input: DetailInput): ProductDetail {
  const { product: p, supabaseUrl } = input;
  const compatibleIds = new Set(input.compatibleVehicles.map((v) => v.id));
  const images = [...input.images]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img) => ({ ...toProductImage(supabaseUrl, img, p.title), sort_order: img.sort_order }));

  const detail: ProductDetail = {
    id: p.id, type: p.type, slug: p.slug, sku: p.sku, title: p.title, manufacturer: p.manufacturer,
    description: p.description,
    price: p.price, price_formatted: formatRub(p.price),
    price_atelier: p.price_atelier, price_atelier_formatted: formatPrice(p.price_atelier),
    sold_as: soldAs(p.type),
    availability: buildAvailability(p, input.reservedQty),
    specs: buildSpecs(p),
    warranty_months: p.warranty_months,
    certifications: p.certifications,
    images,
    fitment: buildDetailFitment(p, input.vehicle, compatibleIds),
    compatible_vehicles: p.type === "carbon_part"
      ? [...input.compatibleVehicles].sort((a, b) => vehicleLabel(a).localeCompare(vehicleLabel(b))).map(vehicleLabel)
      : null,
  };
  if (input.includeStatus) detail.status = p.status;
  return detail;
}
