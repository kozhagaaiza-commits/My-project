import { createHash, timingSafeEqual } from "node:crypto";
import { apiError } from "@/lib/api-error";
import type { AutoRepriceOutcome } from "@/lib/admin/products/auto-reprice";
import type { RefreshResult } from "@/lib/cbr";
import { moscowDate } from "@/lib/orders/view";

// GET /api/cron/daily (Блок 3; 5.12): шесть независимых шагов, ошибка одного не останавливает остальные.
// Авторизация — только Authorization: Bearer <CRON_SECRET> (Vercel подставляет сам). Origin и сессия не нужны и не проверяются
// (/api/cron/* исключён из CSRF-проверки, 5.10). Ответ 200 { data } как в Блоке 3; при сбое шага — 500 INTERNAL_ERROR с
// details.failed_steps / <шаг>_error (Блок 3) и дополнительно details.result — что успело выполниться (отступление, A48).

export const STALE_RATES_AFTER_DAYS = 3;

export interface CronPaymentsSummary { checked: number; paid: number; failed: number }
export interface CronQueueResult { sent: number; failed: number; retried: number; remaining: number; error?: string }

export interface CronDeps {
  /** CRON_SECRET; null / пусто — никакой запрос не авторизован. */
  secret: string | null;
  refreshRates(): Promise<RefreshResult>;
  /** Автопересчёт auto-цен (5.4); вызывается только после успешной загрузки курса. */
  repriceProducts(): Promise<AutoRepriceOutcome>;
  cancelExpiredOrders(): Promise<number>;
  /** reconcileStalePayments (payments/reconcile.ts): pending младше 48 ч, повторные оплаты, возвраты. Не бросает. */
  reconcilePayments(): Promise<CronPaymentsSummary>;
  processQueue(): Promise<CronQueueResult>;
  /** Удалить rate_limit_hits с window_start < olderThan; число удалённых. */
  cleanupRateLimits(olderThan: Date): Promise<number>;
  /** Самая старая из последних дат курсов USD/CNY (YYYY-MM-DD) или null, если курсов нет. */
  latestRateDate(): Promise<string | null>;
  /** Сообщение админу в Telegram; true — доставлено. */
  alertAdmin(text: string): Promise<boolean>;
  now(): Date;
}

export const STEP_NAMES = ["rates", "reprice", "cancel", "payments", "queue", "cleanup"] as const;
export type StepName = (typeof STEP_NAMES)[number];

const errText = (err: unknown): string => (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 300);

function secretMatches(header: string | null, secret: string | null): boolean {
  if (!secret || !header) return false;
  // Сравнение дайджестов одинаковой длины: не зависит от длины и содержимого секрета по времени.
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

const ddmmyyyy = (ymd: string) => ymd.split("-").reverse().join(".");
const dayNumber = (ymd: string) => Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);

/** Курс старше 3 дней (как баннер в /admin: age > 3 суток по Москве). null — курсов нет вообще. */
export function staleRatesText(latest: string | null, now: Date): string | null {
  if (latest === null) return "Курс ЦБ не загружен";
  const age = dayNumber(moscowDate(now)) - dayNumber(latest);
  return age > STALE_RATES_AFTER_DAYS ? `Курс ЦБ не обновлялся с ${ddmmyyyy(latest)}` : null;
}

export interface CronReport {
  data: {
    rates: { USD: RefreshResult["USD"]; CNY: RefreshResult["CNY"] } | null;
    repriced_products: number;
    cancelled_orders: number;
    payments: CronPaymentsSummary | null;
    notifications: { sent: number; failed: number; remaining: number };
    rate_limit_rows_deleted: number;
  };
  errors: Partial<Record<StepName, string>>;
}

export async function runDailyCron(deps: CronDeps): Promise<CronReport> {
  const errors: CronReport["errors"] = {};
  const data: CronReport["data"] = {
    rates: null, repriced_products: 0, cancelled_orders: 0, payments: null,
    notifications: { sent: 0, failed: 0, remaining: 0 }, rate_limit_rows_deleted: 0,
  };
  const fail = (step: StepName, err: unknown) => {
    errors[step] = errText(err);
    console.error({ scope: "cron.daily", step, err: errors[step] });
  };

  // 1. Курсы
  try {
    data.rates = await deps.refreshRates();
  } catch (err) {
    fail("rates", err);
  }
  // 2. Пересчёт цен — только если курс получен (иначе цены не трогаем, 5.12)
  if (data.rates !== null) {
    try {
      data.repriced_products = (await deps.repriceProducts()).repriced_products;
    } catch (err) {
      fail("reprice", err);
    }
  }
  // 3. Отмена просроченных броней
  try {
    data.cancelled_orders = await deps.cancelExpiredOrders();
  } catch (err) {
    fail("cancel", err);
  }
  // 4. Сверка платежей
  try {
    data.payments = await deps.reconcilePayments();
  } catch (err) {
    fail("payments", err);
  }
  // 5. Очередь уведомлений (до 50)
  try {
    const q = await deps.processQueue();
    data.notifications = { sent: q.sent, failed: q.failed, remaining: q.remaining };
    if (q.error) fail("queue", q.error);
  } catch (err) {
    fail("queue", err);
  }
  // 6. Уборка rate_limit_hits + алерт «курс устарел»
  const now = deps.now();
  const cleanupErrors: string[] = [];
  try {
    data.rate_limit_rows_deleted = await deps.cleanupRateLimits(new Date(now.getTime() - 24 * 3600 * 1000));
  } catch (err) {
    cleanupErrors.push(errText(err));
  }
  try {
    const text = staleRatesText(await deps.latestRateDate(), now);
    if (text !== null && !(await deps.alertAdmin(text))) cleanupErrors.push("alert: сообщение админу не доставлено");
  } catch (err) {
    cleanupErrors.push(`alert: ${errText(err)}`);
  }
  if (cleanupErrors.length > 0) fail("cleanup", cleanupErrors.join("; "));

  return { data, errors };
}

export function createCronHandler(getDeps: () => Promise<CronDeps>) {
  return async function GET(request: Request): Promise<Response> {
    let res: Response;
    try {
      const deps = await getDeps();
      if (!secretMatches(request.headers.get("authorization"), deps.secret)) {
        res = apiError("UNAUTHORIZED", "Неверный CRON_SECRET", 401);
      } else {
        const { data, errors } = await runDailyCron(deps);
        const failed = Object.keys(errors) as StepName[];
        if (failed.length === 0) {
          console.info({ scope: "cron.daily", msg: "ok", data }); // итог пишется в лог (5.12)
          res = Response.json({ data });
        } else {
          const details: Record<string, unknown> = { failed_steps: failed, result: data };
          for (const step of failed) details[`${step}_error`] = errors[step];
          res = apiError("INTERNAL_ERROR", "Часть задач не выполнена", 500, details);
        }
      }
    } catch (err) {
      console.error({ scope: "cron.daily", err: errText(err) });
      res = apiError("INTERNAL_ERROR", "Что-то пошло не так. Мы уже разбираемся", 500);
    }
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  };
}
