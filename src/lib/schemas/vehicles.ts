import { z } from "zod";
import { make, uuid } from "./common";

export const vehicleModelsQuery = z.object({ make });
export const vehicleYearsQuery = z.object({ make, model: z.string().trim().min(1).max(60) });
export const vehicleResolveQuery = z.object({
  make,
  model: z.string().trim().min(1).max(60),
  year: z.coerce.number().int().min(1990).max(2100),
});
export const vehicleIdParams = z.object({ id: uuid });
