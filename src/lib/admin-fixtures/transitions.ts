import type { OrderKind, OrderStatus } from "@/lib/admin-ui/types";

// Копия таблицы переходов Чертежа (5.3, src/lib/order-status.ts) — фикстуры не зависят от серверного модуля.
const STOCK: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending_payment: ["cancelled"], paid: ["confirmed"], confirmed: ["shipped"], shipped: ["delivered"],
};
const PREORDER: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending_payment: ["cancelled"], paid: ["ordered_from_supplier"], ordered_from_supplier: ["in_transit"],
  in_transit: ["arrived"], arrived: ["shipped"], shipped: ["delivered"],
};

export const allowedTransitionsFor = (kind: OrderKind, status: OrderStatus): OrderStatus[] =>
  (kind === "stock" ? STOCK : PREORDER)[status] ?? [];
