import { getAtelierSession } from "@/lib/ateliers/session";
import { FEATURE_ATELIER } from "@/lib/config";
import { createMyAtelierHandler } from "./handler";

// GET /api/ateliers/me (Блок 3). Логика — в handler.ts.

const handler = createMyAtelierHandler({ featureAtelier: FEATURE_ATELIER, getSession: getAtelierSession });

export async function GET() {
  return handler();
}
