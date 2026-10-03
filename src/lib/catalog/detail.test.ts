import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toPublicProduct } from "@/lib/catalog";
import { G30, M4, carbonRow, wheelRow } from "@/lib/catalog/__fixtures__/rows";
import { buildProductDetail } from "@/lib/catalog/detail";

const URL_BASE = "https://abcdefghijklmnop.supabase.co";
const sp = (s: string) => s.replace(/ /g, " ");

describe("карточка товара", () => {
  it("диск: JSON по Чертежу (цены, specs, fitment, fastener_note, фото по sort_order)", () => {
    const d = buildProductDetail({
      product: toPublicProduct(wheelRow(), { atelierId: null }), reservedQty: 0, vehicle: G30, compatibleVehicles: [],
      images: [
        { product_id: "p", storage_path: "products/p/b.webp", alt: "Макро спиц M-01", sort_order: 1 },
        { product_id: "p", storage_path: "products/p/a.webp", alt: "Кованый диск M-01 графит, вид спереди", sort_order: 0 },
      ],
      supabaseUrl: URL_BASE, includeStatus: false,
    });
    assert.equal(sp(d.price_formatted), "133 700 ₽");
    assert.equal(d.price_atelier, null);
    assert.equal(d.price_atelier_formatted, null);
    assert.equal(d.sold_as, "Комплект из 4 дисков");
    assert.deepEqual(d.availability.lead_time, null);
    assert.equal(d.specs?.seat_type_label, "Конус 60°");
    assert.equal(d.specs?.construction_label, "Кованый моноблок");
    assert.deepEqual(d.certifications, []);
    assert.deepEqual(d.images.map((i) => i.sort_order), [0, 1]);
    assert.equal(d.images[0].url, `${URL_BASE}/storage/v1/object/public/product-images/products/p/a.webp`);
    assert.deepEqual(d.fitment, {
      vehicle_id: G30.id, vehicle_label: "BMW 5 Series G30 · 2017–2023", fits: true, needs_hub_rings: false,
      fastener_note: "Используйте штатные болты BMW M14×1.25 (конус 60°)",
    });
    assert.equal(d.compatible_vehicles, null);
    assert.equal("status" in d, false);
  });
  it("диск без vehicle → fitment null; не подходит → fits false, fastener_note null", () => {
    const base = { reservedQty: 0, images: [], compatibleVehicles: [], supabaseUrl: URL_BASE, includeStatus: false };
    assert.equal(buildProductDetail({ ...base, product: wheelRow(), vehicle: null }).fitment, null);
    const f = buildProductDetail({ ...base, product: wheelRow({ pcd: "5x120" }), vehicle: G30 }).fitment;
    assert.equal(f?.fits, false);
    assert.equal(f?.fastener_note, null);
  });
  it("карбон: specs null, preorder с lead_time, compatible_vehicles, fits по product_vehicles", () => {
    const m4Vehicle = { ...G30, ...M4 };
    const d = buildProductDetail({
      product: carbonRow(), reservedQty: 0, images: [], vehicle: m4Vehicle, compatibleVehicles: [M4],
      supabaseUrl: URL_BASE, includeStatus: false,
    });
    assert.equal(d.specs, null);
    assert.equal(d.sold_as, "1 шт.");
    assert.equal(d.availability.delivery_text, "Срок поставки 21–35 дней · 100% предоплата");
    assert.deepEqual(d.availability.lead_time, { min_days: 21, max_days: 35 });
    assert.deepEqual(d.compatible_vehicles, ["BMW M4 G82 · 2021–н.в."]);
    assert.deepEqual(d.fitment, { vehicle_id: M4.id, vehicle_label: "BMW M4 G82 · 2021–н.в.", fits: true, needs_hub_rings: false, fastener_note: null });
    const other = buildProductDetail({ product: carbonRow(), reservedQty: 0, images: [], vehicle: G30, compatibleVehicles: [M4], supabaseUrl: URL_BASE, includeStatus: false });
    assert.equal(other.fitment?.fits, false);
  });
  it("admin видит status (для draft/archived)", () => {
    const d = buildProductDetail({ product: wheelRow({ status: "draft" }), reservedQty: 0, images: [], vehicle: null, compatibleVehicles: [], supabaseUrl: URL_BASE, includeStatus: true });
    assert.equal(d.status, "draft");
  });
  it("ателье видит price_atelier", () => {
    const d = buildProductDetail({ product: toPublicProduct(wheelRow(), { atelierId: "a1" }, true), reservedQty: 0, images: [], vehicle: null, compatibleVehicles: [], supabaseUrl: URL_BASE, includeStatus: false });
    assert.equal(d.price_atelier, 11800000);
    assert.equal(sp(d.price_atelier_formatted ?? ""), "118 000 ₽");
  });
});
