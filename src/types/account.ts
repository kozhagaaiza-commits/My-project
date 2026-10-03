// Контракт GET /api/account/orders (Блок 3, «Аккаунт и ателье»). Деньги — *_formatted из целых копеек.
export interface AccountOrder {
  number: string;
  created_at: string; // ISO
  status: string;
  status_label: string;
  kind: "stock" | "preorder";
  total_formatted: string;
  items_count: number;
  url: string; // /orders/FC-26-000131 — доступ по владению, без токена
}

export interface AccountOrdersPage {
  orders: AccountOrder[];
  total: number;
  page: number;
  per_page: number;
}
