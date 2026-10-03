import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_CHECKOUT_VALUES, type CheckoutFormValues } from "@/lib/checkout-form";
import { draftFromValues, generateUuid, requestCartKey, resolveRequestId, restoreValues, serializeDraft } from "@/lib/checkout-draft";
import { uuid } from "@/lib/schemas/common";

const filled: CheckoutFormValues = {
  customer: { name: "Артём Соколов", phone: "+7 (916) 555-12-34", email: "a@b.ru" },
  delivery: { method: "cdek_pvz", city: "Казань", address: "", postal_code: "", cdek_pvz_code: "KZN45" },
  vin: "WBAJA11050B123456",
  comment: "Позвоните",
  consent_pd: true,
  consent_offer: true,
};

describe("черновик формы", () => {
  it("в черновик не попадают согласия", () => {
    const raw = serializeDraft(filled);
    assert.equal(raw.includes("consent"), false);
    assert.equal("consent_pd" in draftFromValues(filled), false);
  });
  it("восстановление: значения возвращаются, согласия всегда false", () => {
    const restored = restoreValues(serializeDraft(filled));
    assert.deepEqual(restored, { ...filled, consent_pd: false, consent_offer: false });
  });
  it("мусор, не-JSON, чужие ключи и пусто → пустая форма / безопасные значения (Edge Case 17)", () => {
    assert.deepEqual(restoreValues(null), EMPTY_CHECKOUT_VALUES);
    assert.deepEqual(restoreValues("{не json"), EMPTY_CHECKOUT_VALUES);
    assert.deepEqual(restoreValues("[1,2]"), EMPTY_CHECKOUT_VALUES);
    const odd = restoreValues(JSON.stringify({ customer: { name: 5, phone: ["x"] }, delivery: { method: "pickup", city: "Казань" }, consent_pd: true, hack: 1 }));
    assert.equal(odd.customer.name, "");
    assert.equal(odd.customer.phone, "");
    assert.equal(odd.delivery.method, "");
    assert.equal(odd.delivery.city, "Казань");
    assert.equal(odd.consent_pd, false);
    assert.equal("hack" in odd, false);
  });
});

describe("client_request_id", () => {
  const cartA = requestCartKey([{ product_id: "p1", quantity: 1 }]);
  const gen = (id: string) => () => id;
  const ID1 = "0e7c4a19-5b2d-4f8e-9a63-1d0c8b7e2f45";
  const ID2 = "1f8d5b2a-6c3e-4a9f-8b74-2e1d9c8f3a56";

  it("первая попытка — новый id, его нужно сохранить", () => {
    assert.deepEqual(resolveRequestId(null, cartA, gen(ID1)), { id: ID1, changed: true });
  });
  it("повтор при том же составе корзины — тот же id (сетевая ошибка, PRICE_CHANGED)", () => {
    const raw = JSON.stringify({ id: ID1, cart_key: cartA });
    assert.deepEqual(resolveRequestId(raw, cartA, gen(ID2)), { id: ID1, changed: false });
  });
  it("смена состава/количества корзины → новый id", () => {
    const raw = JSON.stringify({ id: ID1, cart_key: cartA });
    const cartB = requestCartKey([{ product_id: "p1", quantity: 2 }]);
    assert.deepEqual(resolveRequestId(raw, cartB, gen(ID2)), { id: ID2, changed: true });
  });
  it("после успеха (значение удалено) → новый id; повреждённое/не-UUID значение → новый id", () => {
    assert.equal(resolveRequestId(null, cartA, gen(ID2)).id, ID2);
    assert.equal(resolveRequestId("{мусор", cartA, gen(ID2)).id, ID2);
    assert.equal(resolveRequestId(JSON.stringify({ id: "abc", cart_key: cartA }), cartA, gen(ID2)).id, ID2);
  });
  it("generateUuid даёт валидный UUID, в т.ч. без crypto.randomUUID", () => {
    assert.equal(uuid.safeParse(generateUuid()).success, true);
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      const id = generateUuid();
      assert.equal(uuid.safeParse(id).success, true);
      assert.notEqual(id, generateUuid());
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});
