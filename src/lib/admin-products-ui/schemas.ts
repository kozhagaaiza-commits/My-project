// Схемы Блока 3 «Админка — товары / автомобили» — те же, что на сервере (src/lib/schemas).
import type { z } from "zod";
import { wheelFields } from "@/lib/schemas/admin-products";

export { productUpsertBody, imagesReorderBody } from "@/lib/schemas/admin-products";
export type { ProductUpsertBody } from "@/lib/schemas/admin-products";
export { vehicleUpsertBody } from "@/lib/schemas/admin-vehicles";
export type { VehicleUpsertBody } from "@/lib/schemas/admin-vehicles";
export type WheelBody = z.infer<typeof wheelFields>;
