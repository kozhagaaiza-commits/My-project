import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Клиент с сессией пользователя (cookies) — RLS работает от имени пользователя.
// Создаётся заново на каждый запрос, общий экземпляр не переиспользуется.
// Читает только NEXT_PUBLIC_* напрямую, чтобы не требовать все серверные переменные env.ts.
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY не заданы");
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Вызов из Server Component: писать cookies нельзя.
          // Сессию обновляет src/proxy.ts, поэтому ошибку можно игнорировать.
        }
      },
    },
  });
}
