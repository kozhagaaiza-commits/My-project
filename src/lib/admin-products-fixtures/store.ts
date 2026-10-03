import type { AdminProductDetail, AdminSettings, AdminVehicleRow } from "@/lib/admin-products-ui/types";

export interface AdminProductRecord {
  detail: AdminProductDetail;
  /** Товар есть в заказах: DELETE → 409 «Товар есть в заказах…». */
  in_orders: boolean;
}

/** Изменяемое состояние «сервера» фикстур; одно на сессию Playwright, сбрасывается созданием нового. */
export interface AdminFixtureStore {
  products: AdminProductRecord[];
  vehicles: AdminVehicleRow[];
  settings: AdminSettings;
  /** Размер страницы автомобилей (в API — 20; в тестах меньше, чтобы проверить пагинацию). */
  vehiclesPerPage: number;
  /** Сколько ближайших GET списка вернут 500 (проверка состояния Error и «Повторить»). */
  failLists: { products: number; vehicles: number };
  /** Сколько ближайших PATCH is_active у автомобилей вернут 500 (откат Switch). */
  failVehicleToggle: number;
  /** Задержка ответа, мс (проверка Loading). */
  delayMs: number;
  seq: number;
}
