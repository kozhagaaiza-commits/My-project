import { z } from "zod";

export const uuid = z.uuid();
export const page = z.coerce.number().int().min(1).max(1000).default(1);
export const phoneRu = z.string().trim()
  .transform((v) => v.replace(/[\s()-]/g, "").replace(/^8(\d{10})$/, "+7$1").replace(/^7(\d{10})$/, "+7$1"))
  .pipe(z.string().regex(/^\+7\d{10}$/, "Телефон в формате +7 999 123-45-67"));
export const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Проверьте email"));
export const make = z.enum(["Audi", "BMW", "Mercedes-Benz"]);
export const kopecks = z.number().int().positive().max(100_000_000_00);
