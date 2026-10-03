import { adminProductsDeps } from "@/lib/admin/products/real-deps";
import { createProductVehiclesHandlers } from "./handler";

// PUT /api/admin/products/[id]/vehicles (Блок 3 «Админка — автомобили»). Логика — в handler.ts.

const handlers = createProductVehiclesHandlers(adminProductsDeps);

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handlers.PUT(request, { params });
}
