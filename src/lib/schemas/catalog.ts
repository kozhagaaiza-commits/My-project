import { z } from "zod";
import { page, uuid } from "./common";

export const productsQuery = z.object({
  type: z.enum(["wheel_set", "carbon_part"]),
  vehicle: uuid.optional(),
  diameter: z.coerce.number().int().min(15).max(24).optional(),
  construction: z.enum(["cast", "flow_formed", "forged"]).optional(),
  availability: z.enum(["in_stock", "all"]).default("all"),
  sort: z.enum(["price_asc", "price_desc", "newest"]).default("newest"),
  page,
});

export const productSlugParams = z.object({ slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120) });
export const productDetailQuery = z.object({ vehicle: uuid.optional() });
