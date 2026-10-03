import { adminProductsDeps } from "@/lib/admin/products/real-deps";
import { createAdminProductHandlers } from "./handler";

// GET / PATCH / DELETE /api/admin/products/[id] (Блок 3). Логика — в handler.ts.

const handlers = createAdminProductHandlers(adminProductsDeps);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handlers.GET(request, { params });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handlers.PATCH(request, { params });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handlers.DELETE(request, { params });
}
