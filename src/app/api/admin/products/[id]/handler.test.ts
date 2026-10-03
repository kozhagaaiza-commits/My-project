import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { createAdminProductHandlers } from "@/app/api/admin/products/[id]/handler";
import {
  C1, FakeProductsDb, FakeStorage, IMG1, P1, SUPABASE_URL, T0_CANON, V1, V2, carbonProduct, fakeDeps, image, json, jsonReq,
  params, wheelProduct,
} from "@/lib/admin/products/__fixtures__/fake-repo";

// GET / PATCH / DELETE /api/admin/products/[id] на in-memory подменах (Блок 3; оптимистическая блокировка; BR-14).

const nbsp = (s: unknown) => String(s).replace(/\s/g, " ");
const patchReq = (id: string, body: unknown) => jsonReq("PATCH", `/api/admin/products/${id}`, body);

describe("GET /api/admin/products/[id]", () => {
  it("формат тела POST + id, price, price_updated_at, брони, images (по sort_order), даты", async () => {
    const db = new FakeProductsDb(carbonProduct());
    db.links.add(`${C1}|${V2}`).add(`${C1}|${V1}`);
    db.images.push(image({ id: "i2", product_id: C1, storage_path: `products/${C1}/i2.png`, sort_order: 1, alt: "" }),
      image({ product_id: C1, storage_path: `products/${C1}/${IMG1}.webp` }));
    const { status, body } = await json(await createAdminProductHandlers(fakeDeps(db).deps).GET(new Request(`http://x/api/admin/products/${C1}`), params({ id: C1 })));
    assert.equal(status, 200);
    const d = body.data as Record<string, unknown>;
    assert.equal(d.id, C1);
    assert.equal(d.type, "carbon_part");
    assert.equal(d.wheel, null);
    assert.deepEqual(d.compatible_vehicle_ids, [V2, V1].sort());
    assert.equal(d.purchase_cost, 560000);
    assert.equal(d.purchase_cost_formatted, "¥5,600.00");
    assert.equal(d.price_updated_at, T0_CANON);
    assert.equal(d.updated_at, T0_CANON);
    assert.equal(d.available_qty, 0);
    assert.deepEqual(d.images, [
      { id: IMG1, url: `${SUPABASE_URL}/storage/v1/object/public/product-images/products/${C1}/${IMG1}.webp`, alt: "Вид спереди", sort_order: 0 },
      { id: "i2", url: `${SUPABASE_URL}/storage/v1/object/public/product-images/products/${C1}/i2.png`, alt: "", sort_order: 1 },
    ]);
  });

  it("диск: wheel собран из колонок; брони вычитаются", async () => {
    const db = new FakeProductsDb(wheelProduct());
    db.reserved.set(P1, 3);
    const { body } = await json(await createAdminProductHandlers(fakeDeps(db).deps).GET(new Request("http://x"), params({ id: P1 })));
    const d = body.data as Record<string, unknown>;
    assert.deepEqual(d.wheel, {
      diameter_in: 20, width_front_in: 8.5, width_rear_in: 9.5, et_front_mm: 30, et_rear_mm: 40, pcd: "5x112",
      center_bore_mm: 66.6, seat_type: "cone60", includes_hub_rings: false, includes_fasteners: false,
      construction: "forged_monoblock", finish: "Графит, сатин", weight_kg: 9.8,
    });
    assert.equal(d.reserved_qty, 3);
    assert.equal(d.available_qty, 1);
    assert.deepEqual(d.compatible_vehicle_ids, []);
  });

  it("нет товара или неверный uuid → 404 «Товар не найден»", async () => {
    const h = createAdminProductHandlers(fakeDeps(new FakeProductsDb()).deps);
    for (const id of [P1, "not-a-uuid"]) {
      const { status, body } = await json(await h.GET(new Request("http://x"), params({ id })));
      assert.equal(status, 404);
      assert.deepEqual(body, { error: { code: "NOT_FOUND", message: "Товар не найден" } });
    }
  });
});

describe("PATCH /api/admin/products/[id]", () => {
  afterEach(() => mock.restoreAll());

  it("публикация без фото → 400 дословно Блок 3", async () => {
    const db = new FakeProductsDb(wheelProduct());
    const { status, body } = await json(await createAdminProductHandlers(fakeDeps(db).deps).PATCH(patchReq(P1, { status: "active", updated_at: T0_CANON }), params({ id: P1 })));
    assert.equal(status, 400);
    assert.deepEqual(body, { error: { code: "VALIDATION_ERROR", message: "Добавьте хотя бы одно фото", details: { fields: { images: ["Добавьте хотя бы одно фото"] } } } });
    assert.equal(db.called("updateProduct").length, 0);
  });

  it("публикация с фото + остаток: 200, ответ id + поля + новый updated_at; цена не пересчитывается", async () => {
    const db = new FakeProductsDb(wheelProduct());
    db.images.push(image());
    const { status, body } = await json(await createAdminProductHandlers(fakeDeps(db).deps).PATCH(
      patchReq(P1, { status: "active", stock_qty: 6, updated_at: T0_CANON }), params({ id: P1 })));
    assert.equal(status, 200);
    assert.deepEqual(body, { data: { id: P1, status: "active", stock_qty: 6, updated_at: "2026-10-01T09:41:17.000001Z" } });
    const [, , lock, patch] = db.called("updateProduct")[0];
    assert.equal(lock, T0_CANON);
    assert.deepEqual(patch, { status: "active", stock_qty: 6 });
    assert.equal(db.called("latestRate").length, 0);
  });

  it("updated_at из ответа годится для следующего PATCH (микросекунды не теряются)", async () => {
    const db = new FakeProductsDb(wheelProduct());
    const h = createAdminProductHandlers(fakeDeps(db).deps);
    const first = await json(await h.PATCH(patchReq(P1, { stock_qty: 5, updated_at: T0_CANON }), params({ id: P1 })));
    const next = (first.body.data as { updated_at: string }).updated_at;
    const second = await h.PATCH(patchReq(P1, { stock_qty: 7, updated_at: next }), params({ id: P1 }));
    assert.equal(second.status, 200);
  });

  it("устаревший updated_at (усечён до миллисекунд или чужая вкладка) → 409 CONFLICT", async () => {
    const db = new FakeProductsDb(wheelProduct());
    const { status, body } = await json(await createAdminProductHandlers(fakeDeps(db).deps).PATCH(
      patchReq(P1, { stock_qty: 6, updated_at: "2026-10-01T09:05:00.123Z" }), params({ id: P1 })));
    assert.equal(status, 409);
    assert.deepEqual(body, { error: { code: "CONFLICT", message: "Товар изменили в другой вкладке. Обновите страницу" } });
  });

  it("гонка: запись изменилась между чтением и update → 409 (условие where updated_at)", async () => {
    const db = new FakeProductsDb(wheelProduct());
    const orig = db.updateProduct.bind(db);
    db.updateProduct = async (id, _at, patch) => orig(id, "2000-01-01T00:00:00.000000Z", patch);
    const res = await createAdminProductHandlers(fakeDeps(db).deps).PATCH(patchReq(P1, { stock_qty: 6, updated_at: T0_CANON }), params({ id: P1 }));
    assert.equal(res.status, 409);
  });

  it("смена закупки в auto → пересчёт по курсу, price_updated_at, строка расчёта", async () => {
    const db = new FakeProductsDb(wheelProduct());
    const { body } = await json(await createAdminProductHandlers(fakeDeps(db).deps).PATCH(
      patchReq(P1, { purchase_cost: 81000, updated_at: T0_CANON }), params({ id: P1 })));
    const d = body.data as Record<string, unknown>;
    assert.equal(d.price, 13540000); // 810 × 83.56 × 2 = 135 367.2 → 135 400
    assert.equal(nbsp(d.price_calculation), "810.00 USD × 83.5600 × 2.00 = 135 367,2 ₽ → 135 400 ₽"); // formatRub: minimumFractionDigits 0
    const patch = db.called("updateProduct")[0][3] as Record<string, unknown>;
    assert.deepEqual(patch, { purchase_cost: 81000, price: 13540000, price_updated_at: "2026-10-01T09:41:17.000Z" });
  });

  it("auto: присланная price игнорируется; manual: price из тела", async () => {
    const db = new FakeProductsDb(wheelProduct());
    const h = createAdminProductHandlers(fakeDeps(db).deps);
    const a = await json(await h.PATCH(patchReq(P1, { price: 100, updated_at: T0_CANON }), params({ id: P1 })));
    assert.equal(a.status, 200);
    assert.equal(db.products.get(P1)?.price, 13370000);
    const at = (a.body.data as { updated_at: string }).updated_at;
    const m = await json(await h.PATCH(patchReq(P1, { pricing_mode: "manual", price: 14000000, updated_at: at }), params({ id: P1 })));
    assert.equal((m.body.data as { price: number }).price, 14000000);
  });

  it("manual → auto без курса → 422 RATE_NOT_LOADED", async () => {
    const db = new FakeProductsDb(wheelProduct({ pricing_mode: "manual" }));
    db.rates.delete("USD");
    const { status, body } = await json(await createAdminProductHandlers(fakeDeps(db).deps).PATCH(
      patchReq(P1, { pricing_mode: "auto", updated_at: T0_CANON }), params({ id: P1 })));
    assert.equal(status, 422);
    assert.equal((body.error as { message: string }).message, "Курс USD не загружен. Загрузите курс или задайте цену вручную");
  });

  it("superRefine поверх объединения с текущей записью: сертификации без подтверждения → 400", async () => {
    const db = new FakeProductsDb(wheelProduct());
    const { status, body } = await json(await createAdminProductHandlers(fakeDeps(db).deps).PATCH(
      patchReq(P1, { certifications: ["TÜV"], updated_at: T0_CANON }), params({ id: P1 })));
    assert.equal(status, 400);
    assert.deepEqual((body.error as { details: { fields: unknown } }).details.fields, { claims_verified: ["Сертификации публикуются только после подтверждения"] });
  });

  it("цена ателье выше текущей розницы → 400 (BR-09)", async () => {
    const db = new FakeProductsDb(wheelProduct());
    const { status } = await json(await createAdminProductHandlers(fakeDeps(db).deps).PATCH(
      patchReq(P1, { price_atelier: 13370100, updated_at: T0_CANON }), params({ id: P1 })));
    assert.equal(status, 400);
  });

  it("тип товара не меняется → 400; без updated_at → 400", async () => {
    const h = createAdminProductHandlers(fakeDeps(new FakeProductsDb(wheelProduct())).deps);
    assert.equal((await h.PATCH(patchReq(P1, { type: "carbon_part", updated_at: T0_CANON }), params({ id: P1 }))).status, 400);
    const { body } = await json(await h.PATCH(patchReq(P1, { stock_qty: 1 }), params({ id: P1 })));
    assert.ok((body.error as { details: { fields: Record<string, unknown> } }).details.fields.updated_at);
  });

  it("slug занят другим товаром → 409 SLUG_TAKEN с suggestion", async () => {
    const db = new FakeProductsDb(wheelProduct(), carbonProduct());
    const { status, body } = await json(await createAdminProductHandlers(fakeDeps(db).deps).PATCH(
      patchReq(P1, { slug: "BMW-G30-Carbon-Spoiler", updated_at: T0_CANON }), params({ id: P1 })));
    assert.equal(status, 409);
    assert.deepEqual(body, { error: { code: "SLUG_TAKEN", message: "Такой адрес уже используется", details: { suggestion: "bmw-g30-carbon-spoiler-2" } } });
  });

  it("карбон: compatible_vehicle_ids заменяет привязки и сдвигает updated_at", async () => {
    const db = new FakeProductsDb(carbonProduct());
    db.links.add(`${C1}|${V1}`);
    const { status, body } = await json(await createAdminProductHandlers(fakeDeps(db).deps).PATCH(
      patchReq(C1, { compatible_vehicle_ids: [V2], updated_at: T0_CANON }), params({ id: C1 })));
    assert.equal(status, 200);
    assert.deepEqual([...db.links], [`${C1}|${V2}`]);
    assert.deepEqual((body.data as { compatible_vehicle_ids: string[] }).compatible_vehicle_ids, [V2]);
    assert.deepEqual(db.called("updateProduct")[0][3], { status: "draft" });
  });

  it("сбой записи совместимости после update → 500 с новым updated_at; повтор с ним проходит без CONFLICT", async () => {
    mock.method(console, "error", () => {});
    const db = new FakeProductsDb(carbonProduct());
    db.links.add(`${C1}|${V1}`);
    db.failures.set("replaceProductVehicles", new Error("db down"));
    const h = createAdminProductHandlers(fakeDeps(db).deps);
    const first = await json(await h.PATCH(patchReq(C1, { compatible_vehicle_ids: [V2], updated_at: T0_CANON }), params({ id: C1 })));
    assert.equal(first.status, 500);
    const err = first.body.error as { code: string; message: string; details: { updated_at: string; failed_fields: string[] } };
    assert.equal(err.code, "INTERNAL_ERROR");
    assert.equal(err.message, "Что-то пошло не так. Мы уже разбираемся");
    assert.deepEqual(err.details.failed_fields, ["compatible_vehicle_ids"]);
    assert.notEqual(err.details.updated_at, T0_CANON);
    assert.deepEqual([...db.links], [`${C1}|${V1}`]);

    const stale = await h.PATCH(patchReq(C1, { compatible_vehicle_ids: [V2], updated_at: T0_CANON }), params({ id: C1 }));
    assert.equal(stale.status, 409);
    const retry = await h.PATCH(patchReq(C1, { compatible_vehicle_ids: [V2], updated_at: err.details.updated_at }), params({ id: C1 }));
    assert.equal(retry.status, 200);
    assert.deepEqual([...db.links], [`${C1}|${V2}`]);
  });

  it("ничего не изменилось → 200 без записи", async () => {
    const db = new FakeProductsDb(wheelProduct());
    const { status, body } = await json(await createAdminProductHandlers(fakeDeps(db).deps).PATCH(
      patchReq(P1, { stock_qty: 4, updated_at: T0_CANON }), params({ id: P1 })));
    assert.equal(status, 200);
    assert.deepEqual(body, { data: { id: P1, stock_qty: 4, updated_at: T0_CANON } });
    assert.equal(db.called("updateProduct").length, 0);
  });
});

describe("DELETE /api/admin/products/[id]", () => {
  afterEach(() => mock.restoreAll());
  const del = (id: string) => jsonReq("DELETE", `/api/admin/products/${id}`);

  it("товар в заказах → 409, ничего не удаляется", async () => {
    const db = new FakeProductsDb(wheelProduct());
    db.ordered.add(P1);
    const { status, body } = await json(await createAdminProductHandlers(fakeDeps(db).deps).DELETE(del(P1), params({ id: P1 })));
    assert.equal(status, 409);
    assert.deepEqual(body, { error: { code: "CONFLICT", message: "Товар есть в заказах. Переведите его в архив" } });
    assert.ok(db.products.has(P1));
  });

  it("удаляет строку и все файлы products/<id>/* (включая файлы без строки)", async () => {
    const db = new FakeProductsDb(wheelProduct());
    db.images.push(image());
    const storage = new FakeStorage();
    storage.files.set(`products/${P1}/${IMG1}.webp`, { contentType: "image/webp", size: 1 });
    storage.files.set(`products/${P1}/orphan.jpg`, { contentType: "image/jpeg", size: 1 });
    storage.files.set(`products/${C1}/keep.jpg`, { contentType: "image/jpeg", size: 1 });
    const { status, body } = await json(await createAdminProductHandlers(fakeDeps(db, storage).deps).DELETE(del(P1), params({ id: P1 })));
    assert.equal(status, 200);
    assert.deepEqual(body, { data: { deleted: true } });
    assert.equal(db.products.has(P1), false);
    assert.deepEqual([...storage.files.keys()], [`products/${C1}/keep.jpg`]);
  });

  it("сбой Storage после удаления строки → 200 и запись в лог", async () => {
    const err = mock.method(console, "error", () => {});
    const db = new FakeProductsDb(wheelProduct());
    db.images.push(image());
    const storage = new FakeStorage();
    storage.failures.set("remove", new Error("storage down"));
    const res = await createAdminProductHandlers(fakeDeps(db, storage).deps).DELETE(del(P1), params({ id: P1 }));
    assert.equal(res.status, 200);
    assert.equal((err.mock.calls[0].arguments[0] as { scope: string }).scope, "admin.products.delete.storage_remove");
  });

  it("нет товара → 404", async () => {
    const res = await createAdminProductHandlers(fakeDeps(new FakeProductsDb()).deps).DELETE(del(P1), params({ id: P1 }));
    assert.equal(res.status, 404);
  });
});
