import type { z } from "zod";
import { formatDay } from "@/lib/order-page-format";
import { buildEmail, oneLine, type EmailContent } from "@/lib/notifications/email";
import * as schemas from "@/lib/notifications/payload-schemas";
import {
  NOTIFICATION_TEMPLATES,
  type AdminAtelierAppliedPayload, type AdminAttentionPayload, type AdminOrderPaidPayload, type AtelierApprovedPayload,
  type AtelierRejectedPayload, type CustomerOrderPaidPayload, type CustomerRefundPayload, type CustomerStatusChangedPayload,
  type NotificationChannel, type NotificationTemplate,
} from "@/lib/notifications/types";
import { escapeHtml } from "@/lib/telegram";

// Рендер всех 8 шаблонов (Чертёж 5.9.2, таблица «Тексты сообщений») для Telegram (HTML) и писем (тема + HTML + text).
// payload из БД не доверенный: каждая запись проверяется Zod; битый payload даёт { ok: false } — очередь помечает строку failed.
// Все значения экранируются escapeHtml. Тексты — дословно из таблицы; отступления (дополнительные строки) помечены «ДОБАВЛЕНО».

export type RenderedMessage =
  | { channel: "telegram"; text: string }
  | ({ channel: "email" } & EmailContent);
export type RenderOutcome = { ok: true; message: RenderedMessage } | { ok: false; error: string };

// Лимит Telegram — 4096 символов текста ПОСЛЕ разбора разметки. Он держится «по построению»: длина каждого поля ограничена
// Zod-схемой (payload-schemas.ts), длинные списки/строки обрезаются ДО экранирования и сборки HTML (теги и сущности не режутся),
// сумма худших случаев по каждому шаблону < 4096 (проверено тестом templates.test.ts).
const MAX_ITEM_LINES = 15;
const MAX_ITEM_TITLE = 150;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const link = (url: string, label: string) => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
const e = escapeHtml;

// ---------- Telegram ----------

function vehicleLine(p: AdminOrderPaidPayload): string | null {
  const parts = [p.vehicle_label, p.vin ? `VIN ${p.vin}` : null].filter((x): x is string => x !== null && x !== "");
  return parts.length ? parts.map(e).join(" · ") : null;
}

function tgAdminOrderPaid(p: AdminOrderPaidPayload): string {
  const items = p.items.slice(0, MAX_ITEM_LINES).map((i) => `${e(clip(i.title, MAX_ITEM_TITLE))} ×${i.quantity}`);
  if (p.items.length > MAX_ITEM_LINES) items.push(`… и ещё ${p.items.length - MAX_ITEM_LINES}`);
  return [
    `💳 Оплачен заказ <b>${e(p.order_number)}</b> · ${e(p.total_formatted)}`,
    ...items,
    vehicleLine(p),
    e(p.delivery_label),
    link(p.admin_url, "Открыть заказ"),
  ].filter((l): l is string => l !== null).join("\n");
}

function tgAdminAttention(p: AdminAttentionPayload): string {
  const reason = e(clip(p.reason, 1500));
  const head = p.kind === "payment_create_failed"
    ? `Ошибка создания платежа ${e(p.order_number)}: ${reason}`
    : `⚠️ Заказ <b>${e(p.order_number)}</b> требует внимания: ${reason}`;
  return `${head}\n${link(p.admin_url, "Открыть заказ")}`; // ДОБАВЛЕНО: ссылка на заказ второй строкой
}

const tgAdminAtelierApplied = (p: AdminAtelierAppliedPayload) =>
  `🏁 Новая заявка ателье: ${e(p.company_name)}, ИНН ${e(p.inn)}, ${e(p.city)}`;

/** «Заказ FC-26-000123: Передан в доставку. Трек СДЭК: 1234567890»; трек — только для shipped. */
function statusLine(p: CustomerStatusChangedPayload): string {
  const track = p.status === "shipped" && p.tracking_number ? `. Трек СДЭК: ${p.tracking_number}` : "";
  return `Заказ ${p.order_number}: ${p.status_label}${track}`;
}

/** ДОБАВЛЕНО (A47, Edge Case 21): строки «срок/заметка изменились» в customer_status_changed; пусто для обычной смены статуса. */
function deliveryLines(p: CustomerStatusChangedPayload): string[] {
  const lines: string[] = [];
  const day = p.expected_ready_at ? formatDay(p.expected_ready_at) : null;
  if (day) lines.push(`Ожидаем на складе к ${day}`);
  if (p.customer_visible_note) lines.push(p.customer_visible_note);
  return lines;
}

function tgCustomerStatusChanged(p: CustomerStatusChangedPayload): string {
  const withTrack = p.status === "shipped" && p.tracking_number;
  const lines = [e(statusLine(p)), ...deliveryLines(p).map(e)];
  if (withTrack && p.tracking_url) lines.push(`Отследить: ${e(p.tracking_url)}`); // ДОБАВЛЕНО (US-004, шаг 4)
  return lines.join("\n");
}

const refundSentence = (p: CustomerRefundPayload) =>
  `По заказу ${p.order_number} оформлен возврат ${p.amount_formatted}. Срок зачисления зависит от банка, обычно до 10 рабочих дней`;

// ДОБАВЛЕНО (по заданию Дня 5): Telegram-копия customer_order_paid для подписанного покупателя — в таблице 5.9.2 только email.
const tgCustomerOrderPaid = (p: CustomerOrderPaidPayload) =>
  `Заказ ${e(p.order_number)} оплачен · ${e(p.total_formatted)}. Инженер проверит совместимость и передаст заказ в доставку`;

// ---------- Email ----------

function emailCustomerOrderPaid(p: CustomerOrderPaidPayload): EmailContent {
  return buildEmail(`Заказ ${p.order_number} оплачен`, {
    heading: `Заказ ${p.order_number} оплачен`,
    rows: p.items.map((i) => ({ left: `${i.title} ×${i.quantity}`, right: i.line_total_formatted })),
    total: { left: "Итого", right: p.total_formatted },
    paragraphs: [
      `Доставка: ${p.delivery_method_label} · ${p.delivery_label}`,
      "Инженер проверит совместимость и передаст заказ в доставку",
    ],
    button: { label: "Статус заказа", url: p.order_url },
    footnote: "Сохраните эту ссылку — по ней всегда виден статус заказа",
  });
}

function emailCustomerStatusChanged(p: CustomerStatusChangedPayload): EmailContent {
  const withTrack = p.status === "shipped" && p.tracking_number;
  return buildEmail(`Заказ ${p.order_number}: ${p.status_label}`, {
    heading: statusLine(p),
    paragraphs: [...deliveryLines(p), ...(withTrack && p.tracking_url ? [`Отследить: ${p.tracking_url}`] : [])],
    button: p.order_url ? { label: "Статус заказа", url: p.order_url } : undefined,
  });
}

function emailCustomerRefund(p: CustomerRefundPayload): EmailContent {
  return buildEmail(`Возврат по заказу ${p.order_number}`, {
    heading: `Возврат по заказу ${p.order_number}`,
    paragraphs: [refundSentence(p)],
    button: p.order_url ? { label: "Статус заказа", url: p.order_url } : undefined,
  });
}

const emailAtelierApproved = (p: AtelierApprovedPayload) =>
  buildEmail(`Заявка ${p.company_name} одобрена`, {
    heading: `Заявка ${p.company_name} одобрена`,
    paragraphs: [`Заявка ${p.company_name} одобрена. Цены для ателье доступны после входа на сайт`],
  });

const emailAtelierRejected = (p: AtelierRejectedPayload) =>
  buildEmail(`Заявка ${p.company_name} отклонена`, {
    heading: `Заявка ${p.company_name} отклонена`,
    paragraphs: [`Заявка ${p.company_name} отклонена. Причина: ${p.rejection_reason}. Вы можете подать её повторно`],
  });

// ---------- Реестр ----------

interface Entry {
  channels: readonly NotificationChannel[];
  render(channel: NotificationChannel, payload: unknown): RenderOutcome;
}

function entry<T>(
  schema: z.ZodType<T>,
  fns: { telegram?: (p: T) => string; email?: (p: T) => EmailContent },
): Entry {
  const channels: NotificationChannel[] = [];
  if (fns.telegram) channels.push("telegram");
  if (fns.email) channels.push("email");
  return {
    channels,
    render(channel, payload) {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
        return { ok: false, error: `некорректный payload: ${issues}` };
      }
      if (channel === "telegram" && fns.telegram) {
        return { ok: true, message: { channel, text: fns.telegram(parsed.data) } };
      }
      if (channel === "email" && fns.email) return { ok: true, message: { channel, ...fns.email(parsed.data) } };
      return { ok: false, error: `шаблон не поддерживает канал ${channel}` };
    },
  };
}

const REGISTRY: Record<NotificationTemplate, Entry> = {
  admin_order_paid: entry<AdminOrderPaidPayload>(schemas.adminOrderPaid, { telegram: tgAdminOrderPaid }),
  admin_attention: entry<AdminAttentionPayload>(schemas.adminAttention, { telegram: tgAdminAttention }),
  admin_atelier_applied: entry<AdminAtelierAppliedPayload>(schemas.adminAtelierApplied, { telegram: tgAdminAtelierApplied }),
  customer_order_paid: entry<CustomerOrderPaidPayload>(schemas.customerOrderPaid, { email: emailCustomerOrderPaid, telegram: tgCustomerOrderPaid }),
  customer_status_changed: entry<CustomerStatusChangedPayload>(schemas.customerStatusChanged, { email: emailCustomerStatusChanged, telegram: tgCustomerStatusChanged }),
  customer_refund: entry<CustomerRefundPayload>(schemas.customerRefund, { email: emailCustomerRefund, telegram: (p) => e(refundSentence(p)) }),
  atelier_approved: entry<AtelierApprovedPayload>(schemas.atelierApproved, { email: emailAtelierApproved }),
  atelier_rejected: entry<AtelierRejectedPayload>(schemas.atelierRejected, { email: emailAtelierRejected }),
};

const isTemplate = (v: unknown): v is NotificationTemplate => (NOTIFICATION_TEMPLATES as readonly unknown[]).includes(v);
const isChannel = (v: unknown): v is NotificationChannel => v === "telegram" || v === "email";

/** Рендер строки очереди (или готового уведомления). Не бросает: любая ошибка → { ok: false, error }. */
export function renderNotification(input: { template: unknown; channel: unknown; payload: unknown }): RenderOutcome {
  try {
    if (!isTemplate(input.template)) return { ok: false, error: `неизвестный шаблон ${oneLine(String(input.template)).slice(0, 60)}` };
    if (!isChannel(input.channel)) return { ok: false, error: `неизвестный канал ${oneLine(String(input.channel)).slice(0, 20)}` };
    return REGISTRY[input.template].render(input.channel, input.payload);
  } catch (err: unknown) {
    return { ok: false, error: `ошибка рендера: ${err instanceof Error ? err.message : "unknown"}` };
  }
}

/** Каналы, которые поддерживает шаблон. */
export const templateChannels = (template: NotificationTemplate): readonly NotificationChannel[] => REGISTRY[template].channels;
