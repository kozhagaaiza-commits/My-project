import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ordersApiUrl, ordersHref, parseOrdersFilters } from "@/lib/admin-ui/orders-query";

describe("orders-query", () => {
  it("parse: значения по умолчанию и мусор", () => {
    assert.deepEqual(parseOrdersFilters(""), { tab: "all", attention: false, q: "", page: 1 });
    assert.deepEqual(parseOrdersFilters("status=zzz&page=-4&attention=1"), { tab: "all", attention: false, q: "", page: 1 });
  });

  it("parse: вкладка, внимание, поиск, страница", () => {
    assert.deepEqual(parseOrdersFilters("status=paid&attention=true&q=%20FC-26%20&page=3"), {
      tab: "paid", attention: true, q: "FC-26", page: 3,
    });
  });

  it("href: по умолчанию без параметров, остальное — в URL", () => {
    assert.equal(ordersHref({ tab: "all", attention: false, q: "", page: 1 }), "/admin/orders");
    assert.equal(ordersHref({ tab: "preorder", attention: true, q: "FC-26", page: 2 }), "/admin/orders?status=preorder&attention=true&q=FC-26&page=2");
  });

  it("api: группа статусов через запятую, короткий поиск не отправляется", () => {
    assert.equal(ordersApiUrl({ tab: "closed", attention: false, q: "ab", page: 1 }), "/api/admin/orders?status=cancelled%2Crefunded&page=1");
    assert.equal(ordersApiUrl({ tab: "all", attention: true, q: "FC-26-0009", page: 2 }), "/api/admin/orders?attention=true&q=FC-26-0009&page=2");
  });
});
