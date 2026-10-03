import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { createAdminProductsHandlers } from "@/app/api/admin/products/handler";
import { apiError } from "@/lib/api-error";
import {
  C1, FakeProductsDb, NEW_ID, P1, SUPABASE_URL, T0_CANON, V1, carbonProduct, fakeDeps, image, json, jsonReq, wheelProduct,
} from "@/lib/admin/products/__fixtures__/fake-repo";
import { formatRub } from "@/lib/money";

// GET/POST /api/admin/products на in-memory подменах. JSON и тексты — Блок 3 «Админка — товары».

const nbsp = (s: unknown) => String(s).replace(/\s/g, " ");

const BODY = {
  type: "wheel_set", slug: "forged-m01-r20-5x112-graphite", sku: "FCF-M01-2085-GR",
  title: "Кованый моноблок M-01 R20, 5×112, графит", manufacturer: "ForgeCarbon Forged",
  description: "Кованый моноблок из алюминиевого сплава 6061-T6. Комплект из 4 дисков: передние 8.5J ET30, задние 9.5J ET40.",
  status: "draft", availability_mode: "stock", stock_qty: 4, lead_time_min_days: null, lead_time_max_days: null,
  purchase_currency: "USD", purchase_cost: 80000, pricing_mode: "auto", price: null, price_atelier: 11800000,
  wheel: {
    diameter_in: 20, width_front_in: 8.5, width_rear_in: 9.5, et_front_mm: 30, et_rear_mm: 40, pcd: "5x112",
    center_bore_mm: 66.6, seat_type: "cone60", includes_hub_rings: false, includes_fasteners: false,
    construction: "forged_monoblock", finish: "Графит, сатин", weight_kg: 9.8,
  },
  warranty_months: 24, certifications: [], claims_verified: false, compatible_vehicle_ids: [],
};
const CARBON_BODY = {
  ...BODY, type: "carbon_part", slug: "bmw-g30-carbon-spoiler", sku: "FCC-G30-SP", title: "Карбоновый спойлер BMW G30",
  availability_mode: "preorder", stock_qty: 0, lead_time_min_days: 21, lead_time_max_days: 35, wheel: null,
  purchase_currency: "CNY", purchase_cost: 560000, price_atelier: null, compatible_vehicle_ids: [V1],
};

const post = (body: unknown) => jsonReq("POST", "/api/admin/products", body);
const get = (qs = "") => new Request(`http://localhost:3000/api/admin/products${qs}`);

describe("GET /api/admin/products", () => {
  afterEach(() => mock.restoreAll());

  it("список: формат Блока 3 + slug и cover_url, брони, meta", async () => {
    const db = new FakeProductsDb(wheelProduct({ status: "active" }));
    db.reserved.set(P1, 1);
    db.images.push(image({ sort_order: 1, id: "b", storage_path: `products/${P1}/b.webp` }), image());
    const { deps } = fakeDeps(db);
    const { status, body } = await json(await createAdminProductsHandlers(deps).GET(get("?type=wheel_set&page=1")));
    assert.equal(status, 200);
    assert.deepEqual(body.meta, { total: 1, page: 1, per_page: 20 });
    const [item] = body.data as Array<Record<string, unknown>>;
    assert.deepEqual(item, {
      id: P1, type: "wheel_set", sku: "FCF-M01-2085-GR", slug: "forged-m01-r20-5x112-graphite",
      title: "Кованый моноблок M-01 R20, 5×112, графит", status: "active",
      availability_mode: "stock", stock_qty: 4, reserved_qty: 1, available_qty: 3,
      purchase_currency: "USD", purchase_cost: 80000, purchase_cost_formatted: "$800.00",
      pricing_mode: "auto", price: 13370000, price_formatted: formatRub(13370000),
      price_atelier: 11800000, price_atelier_formatted: formatRub(11800000),
      images_count: 2, cover_url: `${SUPABASE_URL}/storage/v1/object/public/product-images/products/${P1}/${"2b9c1d7e-0a4f-4c3e-8d21-7f5e6a9b0c13"}.webp`,
      updated_at: T0_CANON,
    });
    assert.deepEqual(db.called("listProducts")[0][1], { type: "wheel_set", status: undefined, q: undefined, page: 1, perPage: 20 });
  });

  it("пустой список — без лишних запросов фото и броней", async () => {
    const db = new FakeProductsDb();
    const { body } = await json(await createAdminProductsHandlers(fakeDeps(db).deps).GET(get()));
    assert.deepEqual(body, { data: [], meta: { total: 0, page: 1, per_page: 20 } });
    assert.equal(db.called("reservedQty").length, 0);
  });

  it("неверные параметры → 400 VALIDATION_ERROR с fields", async () => {
    const { deps } = fakeDeps(new FakeProductsDb());
    const { status, body } = await json(await createAdminProductsHandlers(deps).GET(get("?status=deleted&q=a")));
    assert.equal(status, 400);
    const err = body.error as { code: string; details: { fields: Record<string, string[]> } };
    assert.equal(err.code, "VALIDATION_ERROR");
    assert.deepEqual(Object.keys(err.details.fields).sort(), ["q", "status"]);
  });

  it("401/403 из requireAdmin отдаются как есть, до любой работы с БД", async () => {
    const db = new FakeProductsDb();
    const { deps, admin } = fakeDeps(db);
    admin.deny = apiError("FORBIDDEN", "Недостаточно прав", 403);
    const res = await createAdminProductsHandlers(deps).GET(get());
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: { code: "FORBIDDEN", message: "Недостаточно прав" } });
    assert.equal(db.calls.length, 0);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
  });

  it("исключение БД → 500 INTERNAL_ERROR без стека, лог структурой", async () => {
    const err = mock.method(console, "error", () => {});
    const db = new FakeProductsDb();
    db.failures.set("listProducts", new Error("boom secret"));
    const res = await createAdminProductsHandlers(fakeDeps(db).deps).GET(get());
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: { code: "INTERNAL_ERROR", message: "Что-то пошло не так. Мы уже разбираемся" } });
    assert.equal((err.mock.calls[0].arguments[0] as { scope: string }).scope, "admin.products.list");
  });
});

describe("POST /api/admin/products", () => {
  it("201: auto-цена по последнему курсу + строка расчёта Блока 3", async () => {
    const db = new FakeProductsDb();
    const { deps, admin } = fakeDeps(db);
    const { status, body } = await json(await createAdminProductsHandlers(deps).POST(post(BODY)));
    assert.equal(status, 201);
    const data = body.data as Record<string, unknown>;
    assert.equal(data.id, NEW_ID);
    assert.equal(data.slug, "forged-m01-r20-5x112-graphite");
    assert.equal(data.status, "draft");
    assert.equal(data.price, 13370000);
    assert.equal(nbsp(data.price_formatted), "133 700 ₽");
    assert.equal(nbsp(data.price_calculation), "800.00 USD × 83.5600 × 2.00 = 133 696 ₽ → 133 700 ₽");
    assert.match(String(data.updated_at), /^2026-10-01T09:41:17\.\d{6}Z$/);
    const row = db.called("insertProduct")[0][1] as Record<string, unknown>;
    assert.equal(row.price, 13370000);
    assert.equal(row.width_rear_in, 9.5);
    assert.equal(row.price_updated_at, "2026-10-01T09:41:17.000Z");
    assert.equal(admin.calls.length, 1);
  });

  it("manual: цена из тела, price_calculation = null", async () => {
    const db = new FakeProductsDb();
    const { body } = await json(await createAdminProductsHandlers(fakeDeps(db).deps).POST(post({ ...BODY, pricing_mode: "manual", price: 14000000 })));
    assert.equal((body.data as Record<string, unknown>).price, 14000000);
    assert.equal((body.data as Record<string, unknown>).price_calculation, null);
    assert.equal(db.called("latestRate").length, 0);
  });

  it("422 RATE_NOT_LOADED: нет курса USD", async () => {
    const db = new FakeProductsDb();
    db.rates.delete("USD");
    const { status, body } = await json(await createAdminProductsHandlers(fakeDeps(db).deps).POST(post(BODY)));
    assert.equal(status, 422);
    assert.deepEqual(body, { error: { code: "RATE_NOT_LOADED", message: "Курс USD не загружен. Загрузите курс или задайте цену вручную" } });
    assert.equal(db.called("insertProduct").length, 0);
  });

  it("400: Zod Блока 3 (нет параметров диска) — fields из flattenError", async () => {
    const { status, body } = await json(await createAdminProductsHandlers(fakeDeps(new FakeProductsDb()).deps).POST(post({ ...BODY, wheel: null })));
    assert.equal(status, 400);
    assert.deepEqual(body, { error: { code: "VALIDATION_ERROR", message: "Проверьте поля формы", details: { fields: { wheel: ["Заполните параметры диска"] } } } });
  });

  it("400: битый JSON → VALIDATION_ERROR", async () => {
    const res = await createAdminProductsHandlers(fakeDeps(new FakeProductsDb()).deps).POST(post("{oops"));
    assert.equal(res.status, 400);
  });

  it("400: создание сразу active — «Добавьте хотя бы одно фото» (details.fields.images)", async () => {
    const db = new FakeProductsDb();
    const { status, body } = await json(await createAdminProductsHandlers(fakeDeps(db).deps).POST(post({ ...BODY, status: "active" })));
    assert.equal(status, 400);
    assert.deepEqual(body, { error: { code: "VALIDATION_ERROR", message: "Добавьте хотя бы одно фото", details: { fields: { images: ["Добавьте хотя бы одно фото"] } } } });
    assert.equal(db.called("insertProduct").length, 0);
  });

  it("400: цена ателье выше рассчитанной авто-цены (BR-09)", async () => {
    const { status, body } = await json(await createAdminProductsHandlers(fakeDeps(new FakeProductsDb()).deps).POST(post({ ...BODY, price_atelier: 13370001 })));
    assert.equal(status, 400);
    assert.deepEqual((body.error as { details: unknown }).details, { fields: { price_atelier: ["Цена ателье не может быть выше розничной"] } });
  });

  it("409 SLUG_TAKEN с suggestion -2, затем -3", async () => {
    const db = new FakeProductsDb(wheelProduct({ sku: "OTHER-1" }));
    const h = createAdminProductsHandlers(fakeDeps(db).deps);
    const first = await json(await h.POST(post(BODY)));
    assert.equal(first.status, 409);
    assert.deepEqual(first.body, { error: { code: "SLUG_TAKEN", message: "Такой адрес уже используется", details: { suggestion: "forged-m01-r20-5x112-graphite-2" } } });
    db.products.set("x", wheelProduct({ id: "x", slug: "forged-m01-r20-5x112-graphite-2", sku: "OTHER-2" }));
    const second = await json(await h.POST(post(BODY)));
    assert.equal((second.body.error as { details: { suggestion: string } }).details.suggestion, "forged-m01-r20-5x112-graphite-3");
  });

  it("409 SKU_TAKEN: артикул в верхнем регистре, как сохранён", async () => {
    const db = new FakeProductsDb(wheelProduct({ slug: "other" }));
    const { status, body } = await json(await createAdminProductsHandlers(fakeDeps(db).deps).POST(post({ ...BODY, sku: "fcf-m01-2085-gr" })));
    assert.equal(status, 409);
    assert.deepEqual(body, { error: { code: "SKU_TAKEN", message: "Артикул FCF-M01-2085-GR уже есть в каталоге" } });
  });

  it("карбон: привязки к автомобилям сохраняются; CNY по курсу CNY", async () => {
    const db = new FakeProductsDb();
    const { status, body } = await json(await createAdminProductsHandlers(fakeDeps(db).deps).POST(post(CARBON_BODY)));
    assert.equal(status, 201);
    assert.equal((body.data as { price: number }).price, 13130000);
    assert.deepEqual([...db.links], [`${NEW_ID}|${V1}`]);
  });

  it("карбон: неизвестный автомобиль → 400 по полю, товар не создаётся", async () => {
    const db = new FakeProductsDb();
    const unknown = "11111111-2222-4333-8444-555555555555";
    const { status, body } = await json(await createAdminProductsHandlers(fakeDeps(db).deps).POST(post({ ...CARBON_BODY, compatible_vehicle_ids: [unknown] })));
    assert.equal(status, 400);
    assert.deepEqual((body.error as { details: unknown }).details, { fields: { compatible_vehicle_ids: ["Автомобиль не найден в справочнике"] } });
    assert.equal(db.products.size, 0);
  });

  it("сбой привязок → товар удаляется (компенсация), ответ 500", async () => {
    mock.method(console, "error", () => {});
    const db = new FakeProductsDb();
    db.failures.set("replaceProductVehicles", new Error("fk"));
    const res = await createAdminProductsHandlers(fakeDeps(db).deps).POST(post(CARBON_BODY));
    assert.equal(res.status, 500);
    assert.equal(db.products.size, 0);
    mock.restoreAll();
  });

  it("диски: совместимость вручную не задаётся → 400", async () => {
    const { status, body } = await json(await createAdminProductsHandlers(fakeDeps(new FakeProductsDb()).deps).POST(post({ ...BODY, compatible_vehicle_ids: [V1] })));
    assert.equal(status, 400);
    assert.deepEqual((body.error as { details: unknown }).details, {
      fields: { compatible_vehicle_ids: ["Совместимость задаётся только для карбона. Для дисков она рассчитывается по параметрам"] },
    });
  });

  it("карбон не под заказ → 400 Zod «Карбон продаётся только под заказ»", async () => {
    const { body } = await json(await createAdminProductsHandlers(fakeDeps(new FakeProductsDb()).deps).POST(post({ ...CARBON_BODY, availability_mode: "stock" })));
    assert.deepEqual((body.error as { details: { fields: unknown } }).details.fields, { availability_mode: ["Карбон продаётся только под заказ"] });
  });

  it("закупка, дающая цену вне integer → 400 по полю purchase_cost (не 500)", async () => {
    const { status, body } = await json(await createAdminProductsHandlers(fakeDeps(new FakeProductsDb()).deps).POST(post({ ...BODY, purchase_cost: 2_000_000_000, price_atelier: null })));
    assert.equal(status, 400);
    assert.ok((body.error as { details: { fields: Record<string, unknown> } }).details.fields.purchase_cost);
  });

  it("создание диска не трогает другие товары", async () => {
    const db = new FakeProductsDb(carbonProduct());
    await createAdminProductsHandlers(fakeDeps(db).deps).POST(post(BODY));
    assert.ok(db.products.has(C1));
  });
});
