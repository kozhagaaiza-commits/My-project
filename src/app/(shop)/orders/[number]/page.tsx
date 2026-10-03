import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderPageContent } from "@/components/shop/order/OrderPageContent";
import { env } from "@/lib/env";
import type { GetOrderViewResult } from "@/lib/orders/get-view";
import { getOrderView } from "@/lib/orders/get-view";
import { getOrderSessionContext } from "@/lib/orders/session";

const ORDER_NUMBER_RE = /^FC-\d{2}-\d{6}$/;

const first = (value: string | string[] | undefined): string | null =>
  (Array.isArray(value) ? value[0] : value) ?? null;

async function loadView(number: string, token: string | null): Promise<GetOrderViewResult> {
  // Условие записано прямо в выражении: в production-сборке NODE_ENV заменяется на "production", ветка с import
  // фикстур вырезается и src/lib/order-page-fixtures.ts в .next/server не попадает (как в catalog-queries.ts).
  if (process.env.NODE_ENV !== "production" && process.env.ORDERS_FIXTURES === "1") {
    return (await import("@/lib/order-page-fixtures")).getFixtureOrderView(number, token);
  }
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

  const result = await loadView(number, first(sp.t));
  if (result.kind !== "ok") notFound(); // нет заказа и неверный токен — один и тот же ответ (US-004, шаг 6)

  return (
    <OrderPageContent
      initial={result.view}
      token={first(sp.t)}
      fromPayment={first(sp.from) === "payment"}
      botUsername={env.TELEGRAM_BOT_USERNAME}
    />
  );
}
