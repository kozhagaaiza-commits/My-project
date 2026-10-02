import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { G30, carbonRow, wheelRow } from "@/lib/catalog/__fixtures__/rows";
import { wheelFitsVehicle } from "@/lib/catalog/fitment";

const audi = { ...G30, center_bore_mm: 66.5, seat_type: "ball_r13" as const };

describe("wheelFitsVehicle (5.5, копия find_wheels_for_vehicle)", () => {
  it("подходящий диск", () => assert.deepEqual(wheelFitsVehicle(wheelRow(), G30), { fits: true, needs_hub_rings: false }));
  it("PCD 5×120 на 5×112 — не подходит", () => assert.equal(wheelFitsVehicle(wheelRow({ pcd: "5x120" }), G30).fits, false));
  it("диаметр, ширина зада, ET зада вне диапазона", () => {
    assert.equal(wheelFitsVehicle(wheelRow({ diameter_in: 22 }), G30).fits, false);
    assert.equal(wheelFitsVehicle(wheelRow({ width_rear_in: 10.5 }), G30).fits, false);
    assert.equal(wheelFitsVehicle(wheelRow({ et_rear_mm: 45 }), G30).fits, false);
  });
  it("ЦО диска меньше ЦО авто — никогда", () => {
    assert.equal(wheelFitsVehicle(wheelRow({ center_bore_mm: 66.5, includes_hub_rings: true }), G30).fits, false);
  });
  it("разница ЦО ≤ 0.2 — совпадение (66.6 на Audi 66.5; граница 66.8 на 66.6)", () => {
    assert.deepEqual(wheelFitsVehicle(wheelRow({ seat_type: "ball_r13" }), audi), { fits: true, needs_hub_rings: false });
    assert.deepEqual(wheelFitsVehicle(wheelRow({ center_bore_mm: 66.8 }), G30), { fits: true, needs_hub_rings: false });
  });
  it("ЦО больше > 0.2 — только с кольцами, тогда needs_hub_rings", () => {
    assert.equal(wheelFitsVehicle(wheelRow({ center_bore_mm: 72.6 }), G30).fits, false);
    assert.deepEqual(wheelFitsVehicle(wheelRow({ center_bore_mm: 72.6, includes_hub_rings: true }), G30), { fits: true, needs_hub_rings: true });
  });
  it("посадка крепежа: другая — только со своим крепежом", () => {
    assert.equal(wheelFitsVehicle(wheelRow(), audi).fits, false);
    assert.equal(wheelFitsVehicle(wheelRow({ includes_fasteners: true }), audi).fits, true);
  });
  it("карбон — не диск", () => assert.equal(wheelFitsVehicle(carbonRow(), G30).fits, false));
});
