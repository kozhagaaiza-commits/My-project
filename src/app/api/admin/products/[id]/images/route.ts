import { adminProductsDeps } from "@/lib/admin/products/real-deps";
import { createAdminImagesHandlers } from "./handler";

// POST (multipart: file, alt) и PATCH (порядок, подписи) /api/admin/products/[id]/images (Блок 3). Логика — в handler.ts.

const handlers = createAdminImagesHandlers(adminProductsDeps);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handlers.POST(request, { params });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handlers.PATCH(request, { params });
}
