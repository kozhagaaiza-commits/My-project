import { adminVehiclesDeps } from "@/lib/admin/vehicles/real-deps";
import { createAdminVehicleHandlers } from "./handler";

// PATCH / DELETE /api/admin/vehicles/[id] (Блок 3). Логика — в handler.ts.

const handlers = createAdminVehicleHandlers(adminVehiclesDeps);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handlers.PATCH(request, { params });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handlers.DELETE(request, { params });
}
