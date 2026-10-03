import type { Metadata } from "next";
import { LoginForm } from "@/components/shop/auth/LoginForm";

export const metadata: Metadata = { title: "Вход" };

const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function LoginPage({ searchParams }: PageProps<"/auth/login">) {
  const sp = await searchParams;
  // Подмена ответов Supabase для проверки экранов без него: только вне production, условие инлайн (вырезается бандлером).
  const fixtures = process.env.NODE_ENV !== "production" && process.env.AUTH_FIXTURES === "1";
  return <LoginForm next={first(sp.next)} linkExpired={first(sp.error) === "link_expired"} fixtures={fixtures} />;
}
