import { DEFAULT_TAB, MIN_SEARCH_LENGTH, ORDER_TABS, isTabKey } from "@/lib/admin-ui/order-ui";

// URL-параметры списка заказов (Чертёж, Блок 4 «Админка — Заказы»): status (ключ вкладки), attention, q, page.

export interface OrdersFilters {
  tab: string;
  attention: boolean;
  q: string;
  page: number;
}

export function parseOrdersFilters(search: string | URLSearchParams): OrdersFilters {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const status = params.get("status");
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  return {
    tab: isTabKey(status) ? status : DEFAULT_TAB,
    attention: params.get("attention") === "true",
    q: (params.get("q") ?? "").trim().slice(0, 60),
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

/** Поиск уходит в API только от 3 символов (adminOrdersQuery.q: min(3)). */
export const isSearchActive = (q: string): boolean => q.length >= MIN_SEARCH_LENGTH;

/** Ссылка на /admin/orders с фильтрами; значения по умолчанию в URL не пишутся. */
export function ordersHref(f: OrdersFilters): string {
  const params = new URLSearchParams();
  if (f.tab !== DEFAULT_TAB) params.set("status", f.tab);
  if (f.attention) params.set("attention", "true");
  if (f.q) params.set("q", f.q);
  if (f.page > 1) params.set("page", String(f.page));
  const qs = params.toString();
  return qs ? `/admin/orders?${qs}` : "/admin/orders";
}

/** GET /api/admin/orders: несколько статусов вкладки передаются через запятую. */
export function ordersApiUrl(f: OrdersFilters): string {
  const params = new URLSearchParams();
  const statuses = ORDER_TABS.find((t) => t.key === f.tab)?.statuses ?? [];
  if (statuses.length > 0) params.set("status", statuses.join(","));
  if (f.attention) params.set("attention", "true");
  if (isSearchActive(f.q)) params.set("q", f.q);
  params.set("page", String(f.page));
  return `/api/admin/orders?${params.toString()}`;
}
