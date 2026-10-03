import type { Metadata } from "next";
import { LinkExpired } from "@/components/shop/auth/LinkExpired";
import { UpdatePasswordForm } from "@/components/shop/auth/UpdatePasswordForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Новый пароль" };

// Сессия появляется после /auth/callback (обмен кода из письма). Нет сессии — ссылка устарела (US-011, шаг 6).
export default async function UpdatePasswordPage() {
  const fixtures = process.env.NODE_ENV !== "production" && process.env.AUTH_FIXTURES === "1";
  if (!fixtures) {
    let hasUser = false;
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      hasUser = data.user !== null;
    } catch (err) {
      console.error({ scope: "auth.update-password.getUser", err });
    }
    if (!hasUser) return <LinkExpired />;
  }
  return <UpdatePasswordForm fixtures={fixtures} />;
}
