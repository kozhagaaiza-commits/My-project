import { createBrowserClient } from "@supabase/ssr";

// Клиент для клиентских компонентов (auth, профиль). Только NEXT_PUBLIC_*,
// обращение к process.env — прямое, чтобы Next.js подставил значения при сборке.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY не заданы");
  }
  return createBrowserClient(url, anonKey);
}
