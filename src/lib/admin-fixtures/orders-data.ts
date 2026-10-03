import type { AdminOrderDetail, AdminOrderListItem, DeliveryMethod, OrderKind, OrderStatus } from "@/lib/admin-ui/types";
import { allowedTransitionsFor } from "@/lib/admin-fixtures/transitions";
import { formatRub } from "@/lib/money";
import { orderStatusLabel } from "@/lib/order-labels";

// Демо-данные заказов для ADMIN_FIXTURES / Playwright (route.fulfill). Формат — Чертёж, Блок 3 «Админка — заказы».

const WHEEL_ID = "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51";
const CARBON_ID = "3d6a9b14-2c8e-4f71-b0a5-9e4c1d7f2a38";

const CUSTOMERS = [
  { name: "Артём Соколов", phone: "+79165551234", email: "artem.sokolov@yandex.ru" },
  { name: "Мария Левина", phone: "+79031112233", email: "m.levina@mail.ru" },
  { name: "Игорь Власов", phone: "+79267778899", email: "vlasov.igor@gmail.com" },
  { name: "Дарья Корнеева", phone: "+79854443322", email: "daria.korneeva@yandex.ru" },
];
const VEHICLES = ["BMW 5 Series G30 · 2017–2023", "Audi A6 C8 · 2018–2024", "Mercedes-Benz E-Class W213 · 2016–2023"];
const DELIVERY: Record<DeliveryMethod, { label: string; city: string; pvz: string | null; address: string | null; postal: string | null }> = {
  cdek_pvz: { label: "СДЭК ПВЗ · Казань · KZN45", city: "Казань", pvz: "KZN45", address: null, postal: null },
  cdek_door: { label: "СДЭК до двери · Екатеринбург", city: "Екатеринбург", pvz: null, address: "ул. Малышева, 51, кв. 12", postal: "620075" },
  moscow_courier: { label: "Курьер по Москве", city: "Москва", pvz: null, address: "Ленинградский пр-т, 39с1, кв. 7", postal: null },
};

/** Порядок статусов для генерации: первые три — «эталонные» примеры из Чертежа. */
const PLAN: Array<[OrderKind, OrderStatus]> = [
  ["stock", "paid"], ["preorder", "in_transit"], ["stock", "pending_payment"], ["stock", "confirmed"], ["preorder", "paid"],
  ["stock", "shipped"], ["stock", "delivered"], ["preorder", "ordered_from_supplier"], ["stock", "cancelled"], ["stock", "refunded"],
  ["preorder", "arrived"], ["stock", "paid"], ["preorder", "shipped"],
];
export const FIXTURE_ORDERS_COUNT = 41;
const METHODS: DeliveryMethod[] = ["cdek_pvz", "moscow_courier", "cdek_door"];

export const orderId = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const isoAt = (n: number, minutes = 0): string => new Date(Date.UTC(2026, 9, 3, 9, 0) - n * 5_400_000 + minutes * 60_000).toISOString();

interface Spec { n: number; kind: OrderKind; status: OrderStatus; method: DeliveryMethod; attention: boolean }

function specFor(n: number): Spec {
  const [kind, status] = PLAN[(n - 1) % PLAN.length];
  const method = n === 1 ? "cdek_pvz" : n === 6 ? "moscow_courier" : METHODS[n % METHODS.length];
  return { n, kind, status, method, attention: n === 2 || n === 12 };
}

const unitPrice = (kind: OrderKind): number => (kind === "stock" ? 13370000 : 4850000);
const ATTENTION = `Не хватило остатка по товару ${WHEEL_ID}`;

export function buildListItem(n: number): AdminOrderListItem {
  const s = specFor(n);
  const c = CUSTOMERS[n % CUSTOMERS.length];
  const total = unitPrice(s.kind);
  return {
    id: orderId(n), number: `FC-26-${String(124 - n).padStart(6, "0")}`, created_at: isoAt(n), kind: s.kind, status: s.status,
    status_label: orderStatusLabel(s.status), price_tier: "retail", customer_name: c.name, customer_phone: c.phone,
    customer_email: c.email, delivery_label: DELIVERY[s.method].label, total, total_formatted: formatRub(total),
    needs_attention: s.attention, attention_reason: s.attention ? ATTENTION : null, vehicle_label: VEHICLES[n % VEHICLES.length],
  };
}

const PAID_STATUSES: OrderStatus[] = ["paid", "confirmed", "ordered_from_supplier", "in_transit", "arrived", "shipped", "delivered", "refunded"];

export function buildDetail(n: number): AdminOrderDetail {
  const s = specFor(n);
  const l = buildListItem(n);
  const d = DELIVERY[s.method];
  const isPaid = PAID_STATUSES.includes(s.status);
  const paidAmount = isPaid ? l.total : 0;
  const refundedAmount = s.status === "refunded" ? l.total : 0;
  const wheel = s.kind === "stock";
  return {
    id: l.id, number: l.number, kind: s.kind, status: s.status, allowed_transitions: allowedTransitionsFor(s.kind, s.status),
    customer: { name: l.customer_name, phone: l.customer_phone, email: l.customer_email },
    delivery: { method: s.method, city: d.city, cdek_pvz_code: d.pvz, address: d.address, postal_code: d.postal },
    vehicle_label: l.vehicle_label, vin: n % 4 === 0 ? null : "WBAJA11050B123456", customer_comment: n % 2 === 1 ? "Позвоните перед отправкой" : null,
    items: [{
      product_id: wheel ? WHEEL_ID : CARBON_ID,
      title: wheel ? "Кованый моноблок M-01 R20, 5×112, графит" : "Карбоновый сплиттер передний, BMW G30",
      sku: wheel ? "FCF-M01-2085-GR" : "FCC-G30-SPL-01",
      specs: wheel
        ? { type: "wheel_set", diameter_in: 20, width_front_in: 8.5, width_rear_in: 9.5, et_front_mm: 30, et_rear_mm: 40, pcd: "5x112", center_bore_mm: 66.6 }
        : { type: "carbon_part", material: "Сухой карбон", finish: "Глянцевый лак" },
      quantity: 1, unit_price_formatted: l.total_formatted, line_total_formatted: l.total_formatted,
    }],
    total: l.total, total_formatted: l.total_formatted, paid_amount: paidAmount, refunded_amount: refundedAmount,
    refundable_amount: paidAmount - refundedAmount,
    payments: isPaid ? [{ yookassa_payment_id: `30a8d2c1-000f-5000-9000-${String(n).padStart(12, "0")}`, status: "succeeded", method: n % 2 ? "sbp" : "bank_card", amount_formatted: l.total_formatted, created_at: isoAt(n, 2) }] : [],
    refunds: refundedAmount > 0 ? [{ status: "succeeded", amount_formatted: l.total_formatted, reason: "Клиент отказался до отправки", created_at: isoAt(n, 600) }] : [],
    history: [
      { from_status: null, to_status: "pending_payment", note: "Заказ создан", changed_by_name: null, created_at: l.created_at },
      ...(isPaid ? [{ from_status: "pending_payment" as OrderStatus, to_status: "paid" as OrderStatus, note: s.attention ? ATTENTION : "Оплата подтверждена ЮKassa", changed_by_name: null, created_at: isoAt(n, 4) }] : []),
    ],
    tracking_number: s.status === "shipped" && s.method !== "moscow_courier" ? "1234567890" : null,
    courier_note: s.status === "shipped" && s.method === "moscow_courier" ? "Позвонить за час, подъезд 2" : null,
    admin_note: null,
    customer_visible_note: s.kind === "preorder" && isPaid ? "Задержка на таможне" : null,
    expected_ready_at: s.kind === "preorder" && isPaid ? "2026-11-12" : null,
    needs_attention: s.attention, attention_reason: l.attention_reason, telegram_subscribed: n % 3 !== 0,
    consent_pd_at: l.created_at, consent_policy_version: "2026-10-01", updated_at: isoAt(n, 4),
  };
}
