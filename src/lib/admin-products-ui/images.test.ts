import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fitWithin, moveItem, takeFreeSlots, toReorderPayload, validateImageFile, withSortOrder } from "./images";

describe("validateImageFile", () => {
  it("тип и размер", () => {
    assert.equal(validateImageFile({ type: "image/png", size: 1000 }), null);
    assert.equal(validateImageFile({ type: "image/gif", size: 1000 }), "Только JPG, PNG или WebP");
    assert.equal(validateImageFile({ type: "image/webp", size: 5 * 1024 * 1024 + 1 }), "Файл больше 5 МБ");
  });
});

describe("fitWithin", () => {
  it("уменьшает по длинной стороне и не увеличивает", () => {
    assert.deepEqual(fitWithin(4000, 3000), { width: 1600, height: 1200 });
    assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
    assert.deepEqual(fitWithin(3000, 4000), { width: 1200, height: 1600 });
  });
});

describe("takeFreeSlots", () => {
  it("лимит 8 фото", () => {
    assert.deepEqual(takeFreeSlots([1, 2, 3], 6), { accepted: [1, 2], rejected: 1 });
    assert.deepEqual(takeFreeSlots([1], 8), { accepted: [], rejected: 1 });
  });
});

describe("порядок", () => {
  const imgs = [0, 1, 2].map((i) => ({ id: `id${i}`, url: `u${i}`, alt: ` a${i} `, sort_order: i }));
  it("moveItem переставляет и не мутирует", () => {
    assert.deepEqual(moveItem([1, 2, 3], 0, 2), [2, 3, 1]);
    assert.deepEqual(moveItem([1, 2, 3], 2, 0), [3, 1, 2]);
    assert.deepEqual(moveItem([1, 2, 3], 1, 9), [1, 2, 3]);
  });
  it("withSortOrder и payload", () => {
    const moved = withSortOrder(moveItem(imgs, 2, 0));
    assert.deepEqual(moved.map((i) => [i.id, i.sort_order]), [["id2", 0], ["id0", 1], ["id1", 2]]);
    assert.deepEqual(toReorderPayload(moved).images[0], { id: "id2", sort_order: 0, alt: "a2" });
  });
});
