import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAdminVehiclesHandlers } from "@/app/api/admin/vehicles/handler";
import { createAdminVehicleHandlers } from "@/app/api/admin/vehicles/[id]/handler";
import { json, jsonReq, params } from "@/lib/admin/products/__fixtures__/fake-repo";
import { FakeVehiclesDb, G30, NEW_VEHICLE, fakeVehicleDeps, g30 } from "@/lib/admin/vehicles/__fixtures__/fake-repo";
import { apiError } from "@/lib/api-error";

// /api/admin/vehicles и /api/admin/vehicles/[id] на in-memory подмене (Блок 3 «Админка — автомобили»).

const G11 = {
  make: "BMW", model: "7 Series", generation: "G11", year_from: 2015, year_to: 2022, pcd: "5x112", center_bore_mm: 66.6,
  seat_type: "cone60", fastener_spec: "Болт M14×1.25", diameter_min_in: 18, diameter_max_in: 21, width_min_in: 8.0,
  width_max_in: 10.0, et_min_mm: 20, et_max_mm: 45, is_active: true,
};

describe("GET /api/admin/vehicles", () => {
  it("формат Блока 3 + fitting_products_count, meta", async () => {
    const db = new FakeVehiclesDb(g30());
    db.fitting.set(G30, 6);
    const { status, body } = await json(await createAdminVehiclesHandlers(fakeVehicleDeps(db).deps).GET(new Request("http://x/api/admin/vehicles?make=BMW&page=1")));
    assert.equal(status, 200);
    assert.deepEqual(body, {
      data: [{
        id: G30, make: "BMW", model: "5 Series", generation: "G30", year_from: 2017, year_to: 2023, pcd: "5x112",
        center_bore_mm: 66.6, seat_type: "cone60", fastener_spec: "Болт M14×1.25", diameter_min_in: 18, diameter_max_in: 21,
        width_min_in: 8.0, width_max_in: 10.0, et_min_mm: 20, et_max_mm: 40, is_active: true, fitting_products_count: 6,
      }],
      meta: { total: 1, page: 1, per_page: 20 },
    });
  });

  it("неизвестная марка → 400 «Неизвестная марка»", async () => {
    const { status, body } = await json(await createAdminVehiclesHandlers(fakeVehicleDeps(new FakeVehiclesDb()).deps).GET(new Request("http://x/?make=Lada")));
    assert.equal(status, 400);
    assert.equal((body.error as { message: string }).message, "Неизвестная марка");
  });

  it("401 из requireAdmin — до БД", async () => {
    const db = new FakeVehiclesDb();
    const { deps, admin } = fakeVehicleDeps(db);
    admin.deny = apiError("UNAUTHORIZED", "Войдите в аккаунт", 401);
    assert.equal((await createAdminVehiclesHandlers(deps).GET(new Request("http://x/"))).status, 401);
    assert.equal(db.calls.length, 0);
  });
});

describe("POST /api/admin/vehicles", () => {
  it("201 { id, label } + fitting_products_count", async () => {
    const db = new FakeVehiclesDb(g30());
    db.fitting.set(NEW_VEHICLE, 7);
    const { status, body } = await json(await createAdminVehiclesHandlers(fakeVehicleDeps(db).deps).POST(jsonReq("POST", "/api/admin/vehicles", G11)));
    assert.equal(status, 201);
    assert.deepEqual(body, { data: { id: NEW_VEHICLE, label: "BMW 7 Series G11 · 2015–2022", fitting_products_count: 7 } });
  });

  it("дубликат → 409 «BMW 7 Series G11 уже есть в справочнике»", async () => {
    const db = new FakeVehiclesDb(g30({ id: "x", model: "7 Series", generation: "G11" }));
    const { status, body } = await json(await createAdminVehiclesHandlers(fakeVehicleDeps(db).deps).POST(jsonReq("POST", "/api/admin/vehicles", G11)));
    assert.equal(status, 409);
    assert.deepEqual(body, { error: { code: "CONFLICT", message: "BMW 7 Series G11 уже есть в справочнике" } });
  });

  it("refine Блока 3: максимум меньше минимума → 400 по полю", async () => {
    const { status, body } = await json(await createAdminVehiclesHandlers(fakeVehicleDeps(new FakeVehiclesDb()).deps).POST(
      jsonReq("POST", "/api/admin/vehicles", { ...G11, et_max_mm: 10 })));
    assert.equal(status, 400);
    assert.deepEqual((body.error as { details: unknown }).details, { fields: { et_max_mm: ["Максимум меньше минимума"] } });
  });
});

describe("PATCH / DELETE /api/admin/vehicles/[id]", () => {
  const patch = (body: unknown) => jsonReq("PATCH", `/api/admin/vehicles/${G30}`, body);

  it("PATCH { et_max_mm: 42 } → 200 { id, et_max_mm, fitting_products_count }", async () => {
    const db = new FakeVehiclesDb(g30());
    db.fitting.set(G30, 7);
    const { status, body } = await json(await createAdminVehicleHandlers(fakeVehicleDeps(db).deps).PATCH(patch({ et_max_mm: 42 }), params({ id: G30 })));
    assert.equal(status, 200);
    assert.deepEqual(body, { data: { id: G30, et_max_mm: 42, fitting_products_count: 7 } });
    assert.deepEqual(db.calls.find((c) => c[0] === "update"), ["update", G30, { et_max_mm: 42 }]);
  });

  it("PATCH is_active=false (Switch «Активен»)", async () => {
    const db = new FakeVehiclesDb(g30());
    const { body } = await json(await createAdminVehicleHandlers(fakeVehicleDeps(db).deps).PATCH(patch({ is_active: false }), params({ id: G30 })));
    assert.equal((body.data as { is_active: boolean }).is_active, false);
    assert.equal(db.rows.get(G30)?.is_active, false);
  });

  it("refine поверх текущей записи: et_max_mm ниже текущего et_min_mm → 400", async () => {
    const db = new FakeVehiclesDb(g30());
    const { status } = await json(await createAdminVehicleHandlers(fakeVehicleDeps(db).deps).PATCH(patch({ et_max_mm: 10 }), params({ id: G30 })));
    assert.equal(status, 400);
    assert.equal(db.calls.some((c) => c[0] === "update"), false);
  });

  it("смена поколения на занятое → 409 с текстом по итоговой записи", async () => {
    const db = new FakeVehiclesDb(g30(), g30({ id: "other", generation: "G31" }));
    const { status, body } = await json(await createAdminVehicleHandlers(fakeVehicleDeps(db).deps).PATCH(patch({ generation: "G31" }), params({ id: G30 })));
    assert.equal(status, 409);
    assert.equal((body.error as { message: string }).message, "BMW 5 Series G31 уже есть в справочнике");
  });

  it("нет автомобиля → 404 «Автомобиль не найден» (PATCH и DELETE)", async () => {
    const h = createAdminVehicleHandlers(fakeVehicleDeps(new FakeVehiclesDb()).deps);
    const p = await json(await h.PATCH(patch({ et_max_mm: 42 }), params({ id: G30 })));
    assert.deepEqual(p, { status: 404, body: { error: { code: "NOT_FOUND", message: "Автомобиль не найден" } } });
    assert.equal((await h.DELETE(jsonReq("DELETE", "/x"), params({ id: G30 }))).status, 404);
    assert.equal((await h.DELETE(jsonReq("DELETE", "/x"), params({ id: "nope" }))).status, 404);
  });

  it("DELETE → 200 { deleted: true }", async () => {
    const db = new FakeVehiclesDb(g30());
    const { status, body } = await json(await createAdminVehicleHandlers(fakeVehicleDeps(db).deps).DELETE(jsonReq("DELETE", "/x"), params({ id: G30 })));
    assert.equal(status, 200);
    assert.deepEqual(body, { data: { deleted: true } });
    assert.equal(db.rows.size, 0);
  });
});
