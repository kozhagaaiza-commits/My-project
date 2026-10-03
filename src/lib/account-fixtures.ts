import type { AccountOrder, AccountOrdersPage } from "@/types/account";

// Демо-данные кабинета для AUTH_FIXTURES=1 (только вне production; импортируется динамически под инлайн-условием
// в page.tsx, в production-сборку не попадает). ?orders=empty | error | many (45 заказов, 3 страницы).

export const FIXTURE_USER = { id: "00000000-0000-4000-8000-000000000002", email: "artem@yandex.ru" };
export const FIXTURE_PROFILE = { full_name: "Артём Соколов", phone: "+79165551234" };

const STATUSES: Array<[string, string]> = [
  ["paid", "Оплачен"], ["shipped", "Передан в доставку"], ["delivered", "Доставлен"], ["pending_payment", "Ожидает оплаты"],
  ["cancelled", "Отменён"],
];

function order(i: number): AccountOrder {
  const [status, status_label] = STATUSES[i % STATUSES.length];
  const number = `FC-26-${String(131 - i).padStart(6, "0")}`;
  return {
    number, status, status_label,
    created_at: new Date(Date.UTC(2026, 9, 5 - (i % 28), 9, 12)).toISOString(),
    kind: i % 2 === 0 ? "preorder" : "stock",
    total_formatted: `${(98600 + i * 1300).toLocaleString("ru-RU")} ₽`,
    items_count: 1 + (i % 3),
    url: `/orders/${number}`,
  };
}

export function fixtureOrders(mode: string | null, page: number): AccountOrdersPage | null {
  if (mode === "error") return null;
  const total = mode === "empty" ? 0 : mode === "many" ? 45 : 3;
  const perPage = 20;
  const from = (page - 1) * perPage;
  const orders = Array.from({ length: Math.max(0, Math.min(perPage, total - from)) }, (_, i) => order(from + i));
  return { orders, total, page, per_page: perPage };
}
