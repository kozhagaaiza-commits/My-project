import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountHeader } from "@/components/shop/account/AccountHeader";
import { AtelierStatusCard } from "@/components/shop/account/AtelierStatusCard";
import { OrdersSection } from "@/components/shop/account/OrdersSection";
import { ProfileForm } from "@/components/shop/account/ProfileForm";
import { loadAccount, type AccountData } from "@/lib/account/load";
import { FEATURE_ATELIER } from "@/lib/config";
import { page as pageParam } from "@/lib/schemas/common";

export const metadata: Metadata = { title: "Аккаунт", robots: { index: false, follow: false } };

const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] : v) ?? null;

async function load(pageNumber: number, mode: string | null): Promise<{ data: AccountData | null; fixtures: boolean }> {
  // Подмена данных (AUTH_FIXTURES=1) только вне production; условие инлайн, чтобы бандлер вырезал ветку с import фикстур.
  if (process.env.NODE_ENV !== "production" && process.env.AUTH_FIXTURES === "1") {
    const fx = await import("@/lib/account-fixtures");
    return {
      fixtures: true,
      data: { user: fx.FIXTURE_USER, fullName: fx.FIXTURE_PROFILE.full_name, phone: fx.FIXTURE_PROFILE.phone, atelierStatus: null, orders: fx.fixtureOrders(mode, pageNumber) },
    };
  }
  return { fixtures: false, data: await loadAccount(pageNumber) };
}

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const sp = await searchParams;
  const parsed = pageParam.safeParse(first(sp.page) ?? undefined);
  const { data, fixtures } = await load(parsed.success ? parsed.data : 1, first(sp.orders));
  // proxy.ts уже отправляет гостей на вход; здесь — вторая линия (сессия истекла между proxy и страницей).
  if (!data) redirect("/auth/login?next=%2Faccount");

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-6">
      <AccountHeader email={data.user.email} fixtures={fixtures} />
      {FEATURE_ATELIER && <AtelierStatusCard status={data.atelierStatus} />}
      <OrdersSection data={data.orders} />
      <ProfileForm userId={data.user.id} fullName={data.fullName} phone={data.phone} fixtures={fixtures} />
    </div>
  );
}
