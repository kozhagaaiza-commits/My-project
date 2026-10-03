import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDialogReducer, type AddDialog, type AddDialogEvent } from "@/hooks/add-dialog-state";
import { addItem, emptyCart, type CartItem } from "@/lib/cart-store";

const run = (events: AddDialogEvent[], from: AddDialog = null): AddDialog => events.reduce(addDialogReducer, from);
const carbon: CartItem = { product_id: "30000000-0000-4000-8000-000000000001", quantity: 1, price_seen: 9860000, type: "carbon_part" };
const wheel: CartItem = { product_id: "20000000-0000-4000-8000-000000000001", quantity: 1, price_seen: 13370000, type: "wheel_set" };

describe("диалоги «В корзину»", () => {
  it("open/close адресные: закрытие чужого диалога ничего не меняет", () => {
    assert.equal(run([{ type: "open", which: "misfit" }]), "misfit");
    assert.equal(run([{ type: "close", which: "mixed" }], "misfit"), "misfit");
    assert.equal(run([{ type: "close", which: "misfit" }], "misfit"), null);
  });
  it("misfit → «Всё равно добавить» → mixed: onOpenChange(false) от misfit не затирает mixed", () => {
    // В корзине карбон, добавляем диск, который не подходит к авто.
    const cart = addItem(emptyCart(), { item: carbon, kind: "preorder" }).cart;
    let state: AddDialog = run([{ type: "open", which: "misfit" }]);
    // 1. onClick действия: закрыть misfit, затем proceed() обнаруживает конфликт kind и открывает mixed (синхронно).
    state = addDialogReducer(state, { type: "close", which: "misfit" });
    assert.equal(addItem(cart, { item: wheel, kind: "stock" }).status, "mixed_kind");
    state = addDialogReducer(state, { type: "open", which: "mixed" });
    // 2. Radix после onClick вызывает onOpenChange(false) для misfit.
    state = addDialogReducer(state, { type: "close", which: "misfit" });
    assert.equal(state, "mixed");
    // 3. Выбор в mixed закрывает его.
    assert.equal(addDialogReducer(state, { type: "close", which: "mixed" }), null);
  });
});
