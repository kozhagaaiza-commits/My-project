import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AtelierPanel } from "@/components/shop/atelier/AtelierPanel";
import { AtelierTerms } from "@/components/shop/atelier/AtelierTerms";
import { FEATURE_ATELIER } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Для тюнинг-ателье — ForgeCarbon",
  description: "Отдельные цены для тюнинг-ателье после проверки заявки. Склад в Москве, заказы клиентов в одном кабинете.",
};

const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] : v) ?? null;

async function isLoggedIn(guestParam: string | null): Promise<boolean> {
  // Подмена без Supabase (AUTH_FIXTURES=1) только вне production; ?as=guest показывает гостевое состояние.
  // Условие инлайн — бандлер вырезает ветку из production-сборки.
  if (process.env.NODE_ENV !== "production" && process.env.AUTH_FIXTURES === "1") return guestParam !== "guest";
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user !== null;
  } catch (err) {
    console.error({ scope: "atelier.getUser", err });
    return false;
  }
}

export default async function AtelierPage({ searchParams }: PageProps<"/atelier">) {
  if (!FEATURE_ATELIER) notFound();
  const sp = await searchParams;
  const loggedIn = await isLoggedIn(first(sp.as));

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 md:px-6 md:py-12 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-5">
        <AtelierTerms />
      </div>
      <div className="lg:col-span-7">
        <AtelierPanel loggedIn={loggedIn} />
      </div>
    </div>
  );
}
