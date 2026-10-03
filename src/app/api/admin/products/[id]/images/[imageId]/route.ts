import { adminProductsDeps } from "@/lib/admin/products/real-deps";
import { createAdminImageHandlers } from "./handler";

// DELETE /api/admin/products/[id]/images/[imageId] (Блок 3). Логика — в handler.ts.

const handlers = createAdminImageHandlers(adminProductsDeps);

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  return handlers.DELETE(request, { params });
}
