import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { createAdminImagesHandlers } from "@/app/api/admin/products/[id]/images/handler";
import {
  FakeProductsDb, FakeStorage, IMG1, IMG2, ORIGIN, P1, SUPABASE_URL, fakeDeps, image, json, jsonReq, params, wheelProduct,
} from "@/lib/admin/products/__fixtures__/fake-repo";

// POST (multipart) / PATCH /api/admin/products/[id]/images на in-memory подменах БД и Storage (Блок 3, 5.9.5).

const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const HTML = new Uint8Array(new TextEncoder().encode("<html><script>alert(1)</script></html>"));

function upload(bytes: Uint8Array<ArrayBuffer>, type: string, alt?: string, name = "photo.webp") {
  const form = new FormData();
  form.set("file", new File([bytes], name, { type }));
  if (alt !== undefined) form.set("alt", alt);
  return new Request(`${ORIGIN}/api/admin/products/${P1}/images`, { method: "POST", headers: { origin: ORIGIN }, body: form });
}

describe("POST /api/admin/products/[id]/images", () => {
  afterEach(() => mock.restoreAll());

  it("201: путь products/<id>/<uuid>.<ext>, тип по сигнатуре, sort_order = текущее количество", async () => {
    const db = new FakeProductsDb(wheelProduct());
    db.images.push(image());
    const storage = new FakeStorage();
    const { status, body } = await json(await createAdminImagesHandlers(fakeDeps(db, storage).deps).POST(upload(WEBP, "image/webp", "  Макро спиц M-01 "), params({ id: P1 })));
    assert.equal(status, 201);
    const path = `products/${P1}/${IMG2}.webp`;
    assert.deepEqual(body, { data: { id: IMG2, url: `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`, alt: "Макро спиц M-01", sort_order: 1 } });
    assert.deepEqual(storage.files.get(path), { contentType: "image/webp", size: WEBP.length });
    assert.deepEqual(db.called("insertImage")[0][1], { product_id: P1, storage_path: path, alt: "Макро спиц M-01", sort_order: 1 });
  });

  it("PNG и JPEG: расширение и Content-Type по сигнатуре; alt по умолчанию пустой", async () => {
    for (const [bytes, type, ext] of [[PNG, "image/png", "png"], [JPEG, "image/jpeg", "jpg"]] as const) {
      const db = new FakeProductsDb(wheelProduct());
      const storage = new FakeStorage();
      const { body } = await json(await createAdminImagesHandlers(fakeDeps(db, storage).deps).POST(upload(bytes, type), params({ id: P1 })));
      assert.equal((body.data as { alt: string }).alt, "");
      assert.deepEqual([...storage.files.keys()], [`products/${P1}/${IMG2}.${ext}`]);
    }
  });

  it("подделка: заявлен image/png, внутри HTML → 400 «Только JPG, PNG или WebP», в Storage ничего", async () => {
    const db = new FakeProductsDb(wheelProduct());
    const storage = new FakeStorage();
    const { status, body } = await json(await createAdminImagesHandlers(fakeDeps(db, storage).deps).POST(upload(HTML, "image/png"), params({ id: P1 })));
    assert.equal(status, 400);
    assert.deepEqual(body, { error: { code: "VALIDATION_ERROR", message: "Только JPG, PNG или WebP", details: { fields: { file: ["Только JPG, PNG или WebP"] } } } });
    assert.equal(storage.calls.length, 0);
  });

  it("заявленный тип не совпадает с сигнатурой (PNG под видом WebP) → 400", async () => {
    const res = await createAdminImagesHandlers(fakeDeps(new FakeProductsDb(wheelProduct())).deps).POST(upload(PNG, "image/webp"), params({ id: P1 }));
    assert.equal(res.status, 400);
  });

  it("заявлен не-картиночный тип → 400 из Zod (сообщение Блока 3)", async () => {
    const { body } = await json(await createAdminImagesHandlers(fakeDeps(new FakeProductsDb(wheelProduct())).deps).POST(upload(JPEG, "image/gif"), params({ id: P1 })));
    assert.equal((body.error as { message: string }).message, "Только JPG, PNG или WebP");
  });

  it("файл больше 5 МБ → 400 «Файл больше 5 МБ»", async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(JPEG);
    const { status, body } = await json(await createAdminImagesHandlers(fakeDeps(new FakeProductsDb(wheelProduct())).deps).POST(upload(big, "image/jpeg"), params({ id: P1 })));
    assert.equal(status, 400);
    assert.equal((body.error as { code: string; message: string }).message, "Файл больше 5 МБ");
  });

  it("Content-Length заведомо больше лимита → 400 до чтения тела", async () => {
    const req = new Request(`${ORIGIN}/api/admin/products/${P1}/images`, {
      method: "POST", headers: { origin: ORIGIN, "content-length": String(20 * 1024 * 1024) }, body: "x",
    });
    const { status, body } = await json(await createAdminImagesHandlers(fakeDeps(new FakeProductsDb(wheelProduct())).deps).POST(req, params({ id: P1 })));
    assert.equal(status, 400);
    assert.equal((body.error as { message: string }).message, "Файл больше 5 МБ");
  });

  it("8 фото → 409 IMAGES_LIMIT «У товара уже 8 фото»", async () => {
    const db = new FakeProductsDb(wheelProduct());
    for (let i = 0; i < 8; i++) db.images.push(image({ id: `i${i}`, sort_order: i, storage_path: `products/${P1}/i${i}.webp` }));
    const storage = new FakeStorage();
    const { status, body } = await json(await createAdminImagesHandlers(fakeDeps(db, storage).deps).POST(upload(WEBP, "image/webp"), params({ id: P1 })));
    assert.equal(status, 409);
    assert.deepEqual(body, { error: { code: "IMAGES_LIMIT", message: "У товара уже 8 фото" } });
    assert.equal(storage.calls.length, 0);
  });

  it("insert упал после загрузки → файл удаляется; триггер лимита (гонка) → 409", async () => {
    const db = new FakeProductsDb(wheelProduct());
    const storage = new FakeStorage();
    const orig = db.insertImage.bind(db);
    db.insertImage = async (row) => {
      for (let i = 0; i < 8; i++) db.images.push(image({ id: `r${i}` }));
      return orig(row);
    };
    const res = await createAdminImagesHandlers(fakeDeps(db, storage).deps).POST(upload(WEBP, "image/webp"), params({ id: P1 }));
    assert.equal(res.status, 409);
    assert.equal(storage.files.size, 0);
  });

  it("сбой insert → файл удаляется, 500", async () => {
    mock.method(console, "error", () => {});
    const db = new FakeProductsDb(wheelProduct());
    db.failures.set("insertImage", new Error("db down"));
    const storage = new FakeStorage();
    const res = await createAdminImagesHandlers(fakeDeps(db, storage).deps).POST(upload(WEBP, "image/webp"), params({ id: P1 }));
    assert.equal(res.status, 500);
    assert.equal(storage.files.size, 0);
    assert.deepEqual(storage.calls.map((c) => c[0]), ["upload", "remove"]);
  });

  it("нет товара → 404; тело не multipart → 400", async () => {
    const h = createAdminImagesHandlers(fakeDeps(new FakeProductsDb()).deps);
    assert.equal((await h.POST(upload(WEBP, "image/webp"), params({ id: P1 }))).status, 404);
    assert.equal((await h.POST(jsonReq("POST", "/x", { a: 1 }), params({ id: P1 }))).status, 400);
  });
});

describe("PATCH /api/admin/products/[id]/images", () => {
  const reorder = (images: unknown) => jsonReq("PATCH", `/api/admin/products/${P1}/images`, { images });

  it("200 { updated: 2 }: порядок и подписи", async () => {
    const db = new FakeProductsDb(wheelProduct());
    db.images.push(image(), image({ id: IMG2, sort_order: 1, storage_path: `products/${P1}/${IMG2}.webp`, alt: "" }));
    const { status, body } = await json(await createAdminImagesHandlers(fakeDeps(db).deps).PATCH(reorder([
      { id: IMG2, sort_order: 0, alt: "Макро спиц M-01" },
      { id: IMG1, sort_order: 1, alt: "Кованый диск M-01 графит, вид спереди" },
    ]), params({ id: P1 })));
    assert.equal(status, 200);
    assert.deepEqual(body, { data: { updated: 2 } });
    assert.deepEqual(db.images.map((i) => [i.id, i.sort_order, i.alt]).sort(), [
      [IMG1, 1, "Кованый диск M-01 графит, вид спереди"], [IMG2, 0, "Макро спиц M-01"],
    ].sort());
  });

  it("чужое фото → 404 «Фото <id> не принадлежит товару», ничего не меняется", async () => {
    const db = new FakeProductsDb(wheelProduct());
    db.images.push(image());
    const { status, body } = await json(await createAdminImagesHandlers(fakeDeps(db).deps).PATCH(reorder([
      { id: IMG1, sort_order: 1, alt: "" }, { id: IMG2, sort_order: 0, alt: "" },
    ]), params({ id: P1 })));
    assert.equal(status, 404);
    assert.deepEqual(body, { error: { code: "NOT_FOUND", message: `Фото ${IMG2} не принадлежит товару` } });
    assert.equal(db.called("updateImage").length, 0);
  });

  it("повтор id или sort_order > 7 → 400", async () => {
    const db = new FakeProductsDb(wheelProduct());
    db.images.push(image());
    const h = createAdminImagesHandlers(fakeDeps(db).deps);
    assert.equal((await h.PATCH(reorder([{ id: IMG1, sort_order: 0, alt: "" }, { id: IMG1, sort_order: 1, alt: "" }]), params({ id: P1 }))).status, 400);
    assert.equal((await h.PATCH(reorder([{ id: IMG1, sort_order: 8, alt: "" }]), params({ id: P1 }))).status, 400);
  });
});
