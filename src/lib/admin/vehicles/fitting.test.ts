import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FITTING_CONCURRENCY, fittingCounts, mapLimit } from "@/lib/admin/vehicles/fitting";

// fitting_products_count списка автомобилей: порядок результатов и потолок одновременных RPC.

const tick = () => new Promise<void>((r) => setTimeout(r, 1));

describe("mapLimit / fittingCounts", () => {
  it("не больше 5 одновременных вызовов, порядок результатов сохраняется", async () => {
    let active = 0;
    let peak = 0;
    const ids = Array.from({ length: 20 }, (_, i) => `v${i}`);
    const repo = {
      async fittingWheelsCount(id: string) {
        active++;
        peak = Math.max(peak, active);
        await tick();
        active--;
        return Number(id.slice(1));
      },
    };
    assert.deepEqual(await fittingCounts(repo, ids), ids.map((_, i) => i));
    assert.equal(FITTING_CONCURRENCY, 5);
    assert.equal(peak, 5);
  });

  it("пустой список — без вызовов; ошибка вызова отклоняет промис", async () => {
    assert.deepEqual(await mapLimit([], 5, async () => 1), []);
    await assert.rejects(mapLimit([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("rpc down");
      return n;
    }), /rpc down/);
  });
});
