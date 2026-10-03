import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { atelierResolver, EMPTY_ATELIER_VALUES, parseApplyPayload, valuesFromPrevious, type AtelierFormValues } from "@/lib/atelier-ui/form";
import { ateliersApiUrl, ateliersHref, parseAteliersFilters } from "@/lib/admin-ui/ateliers-query";

const valid: AtelierFormValues = {
  company_name: "Garage 77", inn: "7801234564", city: "Санкт-Петербург", contact_name: "Илья Ветров",
  phone: "+7 (921) 300-40-50", website: "", comment: "",
};

describe("форма заявки ателье", () => {
  it("пустые сайт и комментарий уходят как null, телефон нормализуется", () => {
    assert.deepEqual(parseApplyPayload(valid), { ...valid, phone: "+79213004050", website: null, comment: null });
  });

  it("резолвер: русские ошибки по полям, первая на поле", async () => {
    const res = await atelierResolver(EMPTY_ATELIER_VALUES, undefined, { fields: {}, shouldUseNativeValidation: false });
    assert.equal(res.errors.company_name?.message, "Минимум 2 символа");
    assert.equal(res.errors.inn?.message, "ИНН — 10 или 12 цифр");
    assert.equal(res.errors.website, undefined);
  });

  it("резолвер: неверная контрольная сумма ИНН", async () => {
    const res = await atelierResolver({ ...valid, inn: "7801234567" }, undefined, { fields: {}, shouldUseNativeValidation: false });
    assert.equal(res.errors.inn?.message, "Проверьте ИНН — контрольная сумма не совпадает");
  });

  it("повторная подача предзаполняет только известные поля", () => {
    const v = valuesFromPrevious({ id: "1", company_name: "A1", inn: "7801234564", city: "СПб", status: "rejected", status_label: "Отклонена", rejection_reason: null, created_at: "2026-10-01T00:00:00.000Z" });
    assert.equal(v.company_name, "A1");
    assert.equal(v.phone, "");
  });
});

describe("фильтры /admin/ateliers", () => {
  it("по умолчанию pending, мусор отбрасывается", () => {
    assert.deepEqual(parseAteliersFilters("status=xx&page=-3"), { status: "pending", page: 1 });
  });
  it("ссылки и API-url", () => {
    assert.equal(ateliersHref({ status: "pending", page: 1 }), "/admin/ateliers");
    assert.equal(ateliersHref({ status: "rejected", page: 2 }), "/admin/ateliers?status=rejected&page=2");
    assert.equal(ateliersApiUrl({ status: "approved", page: 1 }), "/api/admin/ateliers?status=approved&page=1");
  });
});
