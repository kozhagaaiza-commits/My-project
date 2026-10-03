import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { OrderPageContent } from "@/components/shop/order/OrderPageContent";
import { env } from "@/lib/env";
import type { GetOrderViewResult } from "@/lib/orders/get-view";
import { getOrderView } from "@/lib/orders/get-view";
import { getOrderSessionContext } from "@/lib/orders/session";
import { limitOrderRead } from "@/lib/rate-limit";

// Потолок функции: сверка с ЮKassa внутри getOrderView ограничена RECONCILE_BUDGET_MS, остаток — в after().
export const maxDuration = 30;

const ORDER_NUMBER_RE = /^FC-\d{2}-\d{6}$/;

const first = (value: string | string[] | undefined): string | null =>
  (Array.isArray(value) ? value[0] : value) ?? null;

async function loadView(number: string, token: string | null): Promise<GetOrderViewResult> {
  // Условие записано прямо в выражении: в production-сборке NODE_ENV заменяется на "production", ветка с import
  // фикстур вырезается и src/lib/order-page-fixtures.ts в .next/server не попадает (как в catalog-queries.ts).
  if (process.env.NODE_ENV !== "production" && process.env.ORDERS_FIXTURES === "1") {
    const fixtures = await import("@/lib/order-page-fixtures");
    const delay = fixtures.fixtureDelayMs(number);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    return fixtures.getFixtureOrderView(number, token);
  }
  // Лимит чтения заказа (30 / 60 с на IP, как у GET /api/orders/[number]) — защита от перебора номеров и токенов.
  // limitOrderRead принимает Request: собираем его из заголовков запроса страницы. Превышение/сбой хранилища → error.tsx.
  const limited = await limitOrderRead(new Request("http://order.local/", { headers: await headers() }));
  if (limited) throw new Error("orders.page: rate limited");
  return getOrderView({ number, token, ctx: await getOrderSessionContext() });
}

// Страница с персональной ссылкой: не индексируется, ссылка (токен в ?t=) не уходит в Referer на внешние ресурсы.
export async function generateMetadata({ params }: PageProps<"/orders/[number]">): Promise<Metadata> {
  const { number } = await params;
  return {
    title: ORDER_NUMBER_RE.test(number) ? `Заказ ${number}` : "Заказ",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[number]">) {
  const [{ number }, sp] = await Promise.all([params, searchParams]);
  if (!ORDER_NUMBER_RE.test(number)) notFound();

  // Пустой ?t= — как неверный токен (404, как в API); токена в ссылке нет вовсе — доступ только владельцу/admin.
  const rawToken = first(sp.t);
  if (rawToken === "") notFound();
  const result = await loadView(number, rawToken);
  if (result.kind !== "ok") notFound(); // нет заказа и неверный токен — один и тот же ответ (US-004, шаг 6)

  return (
    <OrderPageContent
      initial={result.view}
      token={rawToken}
      fromPayment={first(sp.from) === "payment"}
      botUsername={env.TELEGRAM_BOT_USERNAME}
    />
  );
}
