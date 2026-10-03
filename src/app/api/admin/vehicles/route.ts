import { adminVehiclesDeps } from "@/lib/admin/vehicles/real-deps";
import { createAdminVehiclesHandlers } from "./handler";

// GET /api/admin/vehicles, POST /api/admin/vehicles (Блок 3). Логика — в handler.ts.

const handlers = createAdminVehiclesHandlers(adminVehiclesDeps);

export async function GET(request: Request) {
  return handlers.GET(request);
}

export async function POST(request: Request) {
  return handlers.POST(request);
}
