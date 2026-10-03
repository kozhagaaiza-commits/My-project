import type { RequireAdmin } from "./auth";
import type { AdminProductsRepo, ImageStorage } from "./repo";

// Зависимости обработчиков /api/admin/products*, /api/admin/prices/recalculate. Реальные — ./real-deps.ts,
// в тестах — in-memory подмены (./fake-repo.ts). Модуль без env и сети.

export interface AdminProductsDeps {
  /** null — администратор; иначе готовый 401 / 403 / 429 (и 403 Origin на мутациях). */
  requireAdmin: RequireAdmin;
  repo(): Promise<AdminProductsRepo>;
  storage(): Promise<ImageStorage>;
  /** NEXT_PUBLIC_SUPABASE_URL — для публичных URL фото. */
  supabaseUrl(): string;
  now(): Date;
  randomUUID(): string;
}
