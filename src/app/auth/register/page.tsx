import type { Metadata } from "next";
import { RegisterForm } from "@/components/shop/auth/RegisterForm";

export const metadata: Metadata = { title: "Регистрация" };

const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function RegisterPage({ searchParams }: PageProps<"/auth/register">) {
  const sp = await searchParams;
  const fixtures = process.env.NODE_ENV !== "production" && process.env.AUTH_FIXTURES === "1";
  return <RegisterForm next={first(sp.next)} fixtures={fixtures} />;
}
