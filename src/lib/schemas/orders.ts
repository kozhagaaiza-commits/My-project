import { z } from "zod";
import { email, kopecks, phoneRu, uuid } from "./common";

export const createOrderBody = z.object({
  client_request_id: uuid,
  items: z.array(z.object({ product_id: uuid, quantity: z.number().int().min(1).max(4) })).min(1).max(10)
    .refine((a) => new Set(a.map((i) => i.product_id)).size === a.length, "Один товар — одна позиция"),
  expected_total: kopecks,
  customer: z.object({
    name: z.string().trim().min(2, "Минимум 2 символа").max(100),
    phone: phoneRu,
    email,
  }),
  delivery: z.discriminatedUnion("method", [
    z.object({
      method: z.literal("moscow_courier"),
      city: z.literal("Москва"),
      address: z.string().trim().min(10, "Укажите улицу, дом и квартиру").max(300),
      postal_code: z.string().regex(/^\d{6}$/).nullable(),
      cdek_pvz_code: z.null(),
    }),
    z.object({
      method: z.literal("cdek_pvz"),
      city: z.string().trim().min(2).max(80),
      cdek_pvz_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, "Код ПВЗ из 3–20 латинских букв и цифр"),
      address: z.null(),
      postal_code: z.null(),
    }),
    z.object({
      method: z.literal("cdek_door"),
      city: z.string().trim().min(2).max(80),
      address: z.string().trim().min(10).max(300),
      postal_code: z.string().regex(/^\d{6}$/, "Индекс — 6 цифр"),
      cdek_pvz_code: z.null(),
    }),
  ]),
  vehicle_id: uuid.nullable(),
  vin: z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN — 17 символов без I, O, Q").nullable(),
  comment: z.string().trim().max(1000).nullable(),
  consent_pd: z.literal(true, { error: "Нужно согласие на обработку персональных данных" }),
  consent_offer: z.literal(true, { error: "Нужно принять условия оферты" }),
});

export type CreateOrderBody = z.infer<typeof createOrderBody>;

// GET /api/orders/[number]?t=<token> (Блок 3) — дословно; используются и POST /api/orders/[number]/pay.
export const orderParams = z.object({ number: z.string().regex(/^FC-\d{2}-\d{6}$/) });
export const orderTokenQuery = z.object({ t: z.string().regex(/^[A-Za-z0-9_-]{32}$/).optional() });
