import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DbError } from "@/lib/orders/errors";
import { detectImageType } from "@/lib/admin/products/image-signature";
import { formatPurchaseCost } from "@/lib/admin/products/format";
import { productUniqueViolation, suggestSlug } from "@/lib/admin/products/slug";
import { canonicalTimestamp } from "@/lib/admin/products/timestamps";
import { productPatchBody, productUpsertBody } from "@/lib/schemas/admin-products";
import { vehiclePatchBody, vehicleUpsertBody } from "@/lib/schemas/admin-vehicles";

describe("canonicalTimestamp: микросекунды для updated_at = $2", () => {
  it("PostgREST +00:00 → Z с 6 знаками; смещение переводится в UTC", () => {
    assert.equal(canonicalTimestamp("2026-10-01T09:05:00.123456+00:00"), "2026-10-01T09:05:00.123456Z");
    assert.equal(canonicalTimestamp("2026-10-01T12:05:00.5+03:00"), "2026-10-01T09:05:00.500000Z");
    assert.equal(canonicalTimestamp("2026-10-01T09:05:00Z"), "2026-10-01T09:05:00.000000Z");
    assert.equal(canonicalTimestamp("2026-10-01 09:05:00.1+00"), "2026-10-01T09:05:00.100000Z");
    assert.equal(canonicalTimestamp("вчера"), null);
  });
});

describe("suggestSlug / productUniqueViolation", () => {
  it("-2, -3; длина ≤ 120", () => {
    assert.equal(suggestSlug("a", ["a"]), "a-2");
    assert.equal(suggestSlug("a", ["a", "a-2"]), "a-3");
    const long = "x".repeat(119) + "y";
    assert.equal(suggestSlug(long, [long]).length, 120);
  });
  it("23505 по имени ограничения или Key (…)", () => {
    assert.equal(productUniqueViolation(new DbError("s", "23505", 'violates unique constraint "products_slug_key"')), "slug");
    assert.equal(productUniqueViolation(new DbError("s", "23505", "x | Key (sku)=(A) already exists.")), "sku");
    assert.equal(productUniqueViolation(new DbError("s", "23514", "products_slug_key")), null);
    assert.equal(productUniqueViolation(new Error("products_slug_key")), null);
  });
});

describe("detectImageType: magic bytes", () => {
  it("JPEG / PNG / WebP / прочее", () => {
    assert.equal(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xdb])), "image/jpeg");
    assert.equal(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
    assert.equal(detectImageType(new TextEncoder().encode("RIFF\x00\x00\x00\x00WEBPVP8 ")), "image/webp");
    assert.equal(detectImageType(new TextEncoder().encode("RIFF\x00\x00\x00\x00WAVEfmt ")), null);
    assert.equal(detectImageType(new TextEncoder().encode("GIF89a")), null);
    assert.equal(detectImageType(new Uint8Array([])), null);
  });
});

describe("formatPurchaseCost", () => {
  it("$800.00 (Блок 3), юани, рубли через formatRub", () => {
    assert.equal(formatPurchaseCost(80000, "USD"), "$800.00");
    assert.equal(formatPurchaseCost(123456789, "USD"), "$1,234,567.89");
    assert.equal(formatPurchaseCost(560000, "CNY"), "¥5,600.00");
    assert.equal(formatPurchaseCost(5000000, "RUB").replace(/\s/g, " "), "50 000 ₽");
  });
});

describe("схемы админки: partial без исключения Zod 4", () => {
  it("productPatchBody: подмножество + updated_at; productUpsertBody: superRefine", () => {
    assert.ok(productPatchBody.safeParse({ status: "active", stock_qty: 6, updated_at: "2026-10-01T09:05:00.000Z" }).success);
    assert.ok(productPatchBody.safeParse({ updated_at: "2026-10-01T09:05:00.123456Z" }).success);
    assert.equal(productPatchBody.safeParse({ status: "active" }).success, false);
    const r = productUpsertBody.safeParse({
      type: "carbon_part", slug: " Spoiler-G30 ", sku: "fcc-1", title: "Спойлер", manufacturer: "FC", description: "",
      status: "draft", availability_mode: "preorder", stock_qty: 0, lead_time_min_days: 30, lead_time_max_days: 20,
      purchase_currency: "CNY", purchase_cost: 1, pricing_mode: "manual", price: null, price_atelier: null, wheel: null,
      warranty_months: 12, certifications: [], claims_verified: false, compatible_vehicle_ids: [],
    });
    assert.equal(r.success, false);
    if (!r.success) assert.deepEqual(Object.keys(r.error.flatten().fieldErrors).sort(), ["lead_time_max_days", "price"]);
  });
  it("vehiclePatchBody / vehicleUpsertBody", () => {
    assert.ok(vehiclePatchBody.safeParse({ et_max_mm: 42 }).success);
    assert.equal(vehicleUpsertBody.safeParse({ make: "BMW" }).success, false);
  });
});
