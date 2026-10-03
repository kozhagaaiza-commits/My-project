import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { createAdminImageHandlers } from "@/app/api/admin/products/[id]/images/[imageId]/handler";
import {
  FakeProductsDb, FakeStorage, IMG1, IMG2, P1, fakeDeps, image, json, jsonReq, params, wheelProduct,
} from "@/lib/admin/products/__fixtures__/fake-repo";

// DELETE /api/admin/products/[id]/images/[imageId] (Блок 3): файл из Storage, затем строка; BR-14 для active.

const del = (imageId: string) => jsonReq("DELETE", `/api/admin/products/${P1}/images/${imageId}`);
const path1 = `products/${P1}/${IMG1}.webp`;

function setup(status: "draft" | "active", count: number) {
  const db = new FakeProductsDb(wheelProduct({ status }));
  const storage = new FakeStorage();
  db.images.push(image());
  storage.files.set(path1, { contentType: "image/webp", size: 1 });
  if (count > 1) db.images.push(image({ id: IMG2, sort_order: 1, storage_path: `products/${P1}/${IMG2}.webp` }));
  return { db, storage, h: createAdminImageHandlers(fakeDeps(db, storage).deps) };
}

describe("DELETE /api/admin/products/[id]/images/[imageId]", () => {
  afterEach(() => mock.restoreAll());

  it("единственное фото active-товара → 409 дословно, файл и строка на месте", async () => {
    const { db, storage, h } = setup("active", 1);
    const { status, body } = await json(await h.DELETE(del(IMG1), params({ id: P1, imageId: IMG1 })));
    assert.equal(status, 409);
    assert.deepEqual(body, { error: { code: "CONFLICT", message: "Нельзя удалить единственное фото опубликованного товара" } });
    assert.equal(db.images.length, 1);
    assert.ok(storage.files.has(path1));
  });

  it("active с двумя фото: сначала Storage, затем строка → 200 { deleted: true }", async () => {
    const { db, storage, h } = setup("active", 2);
    const { status, body } = await json(await h.DELETE(del(IMG1), params({ id: P1, imageId: IMG1 })));
    assert.equal(status, 200);
    assert.deepEqual(body, { data: { deleted: true } });
    assert.deepEqual(storage.calls, [["remove", [path1]]]);
    assert.deepEqual(db.images.map((i) => i.id), [IMG2]);
  });

  it("черновик: последнее фото удалить можно", async () => {
    const { db, h } = setup("draft", 1);
    assert.equal((await h.DELETE(del(IMG1), params({ id: P1, imageId: IMG1 }))).status, 200);
    assert.equal(db.images.length, 0);
  });

  it("сбой Storage → 500, строка не удаляется", async () => {
    mock.method(console, "error", () => {});
    const { db, storage, h } = setup("draft", 1);
    storage.failures.set("remove", new Error("down"));
    assert.equal((await h.DELETE(del(IMG1), params({ id: P1, imageId: IMG1 }))).status, 500);
    assert.equal(db.images.length, 1);
  });

  it("чужое / несуществующее фото и товар → 404", async () => {
    const { h } = setup("draft", 1);
    const other = await json(await h.DELETE(del(IMG2), params({ id: P1, imageId: IMG2 })));
    assert.deepEqual(other, { status: 404, body: { error: { code: "NOT_FOUND", message: "Фото не найдено" } } });
    const noProduct = createAdminImageHandlers(fakeDeps(new FakeProductsDb()).deps);
    assert.equal((await noProduct.DELETE(del(IMG1), params({ id: P1, imageId: IMG1 }))).status, 404);
  });
});
