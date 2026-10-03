import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createProductVehiclesHandlers } from "@/app/api/admin/products/[id]/vehicles/handler";
import { C1, FakeProductsDb, P1, V1, V2, carbonProduct, fakeDeps, json, jsonReq, params, wheelProduct } from "@/lib/admin/products/__fixtures__/fake-repo";

// PUT /api/admin/products/[id]/vehicles (Блок 3): полная замена совместимости карбона.

const put = (id: string, body: unknown) => jsonReq("PUT", `/api/admin/products/${id}/vehicles`, body);

describe("PUT /api/admin/products/[id]/vehicles", () => {
  it("200: полная замена, повторы убираются", async () => {
    const db = new FakeProductsDb(carbonProduct());
    db.links.add(`${C1}|${V1}`);
    const { status, body } = await json(await createProductVehiclesHandlers(fakeDeps(db).deps).PUT(put(C1, { vehicle_ids: [V2, V2] }), params({ id: C1 })));
    assert.equal(status, 200);
    assert.deepEqual(body, { data: { product_id: C1, vehicle_ids: [V2] } });
    assert.deepEqual([...db.links], [`${C1}|${V2}`]);
  });

  it("пустой список снимает все привязки", async () => {
    const db = new FakeProductsDb(carbonProduct());
    db.links.add(`${C1}|${V1}`);
    await createProductVehiclesHandlers(fakeDeps(db).deps).PUT(put(C1, { vehicle_ids: [] }), params({ id: C1 }));
    assert.equal(db.links.size, 0);
  });

  it("диск → 400 дословно Блок 3", async () => {
    const db = new FakeProductsDb(wheelProduct());
    const { status, body } = await json(await createProductVehiclesHandlers(fakeDeps(db).deps).PUT(put(P1, { vehicle_ids: [V1] }), params({ id: P1 })));
    assert.equal(status, 400);
    assert.deepEqual(body, { error: { code: "VALIDATION_ERROR", message: "Совместимость задаётся только для карбона. Для дисков она рассчитывается по параметрам" } });
    assert.equal(db.called("replaceProductVehicles").length, 0);
  });

  it("неизвестный автомобиль → 400 по полю vehicle_ids; не uuid → 400 Zod; нет товара → 404", async () => {
    const h = createProductVehiclesHandlers(fakeDeps(new FakeProductsDb(carbonProduct())).deps);
    const unknown = await json(await h.PUT(put(C1, { vehicle_ids: ["11111111-2222-4333-8444-555555555555"] }), params({ id: C1 })));
    assert.equal(unknown.status, 400);
    assert.deepEqual((unknown.body.error as { details: unknown }).details, { fields: { vehicle_ids: ["Автомобиль не найден в справочнике"] } });
    assert.equal((await h.PUT(put(C1, { vehicle_ids: ["x"] }), params({ id: C1 }))).status, 400);
    assert.equal((await h.PUT(put(P1, { vehicle_ids: [] }), params({ id: P1 }))).status, 404);
  });
});
