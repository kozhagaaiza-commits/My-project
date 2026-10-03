import type { RequireAdmin } from "@/lib/admin/products/auth";
import type { AdminVehiclesRepo } from "./repo";

// Зависимости обработчиков /api/admin/vehicles*. Реальные — ./real-deps.ts, в тестах — in-memory подмена.

export interface AdminVehiclesDeps {
  requireAdmin: RequireAdmin;
  repo(): Promise<AdminVehiclesRepo>;
}
