import { adminProductsDeps } from "@/lib/admin/products/real-deps";
import { createRecalculateHandler } from "./handler";

// POST /api/admin/prices/recalculate (Блок 3). Логика — в handler.ts.

const handlers = createRecalculateHandler(adminProductsDeps);

export async function POST(request: Request) {
  return handlers.POST(request);
}
