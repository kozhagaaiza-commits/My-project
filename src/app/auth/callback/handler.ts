import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth-next";

// GET /auth/callback?code=…&next=… (Блок 5, «Регистрация» п. 4–5; US-011). Обмен кода на сессию (PKCE) и redirect.
// next — только относительный путь (Edge Case 28), иначе /account. Ошибка обмена, нет code, error=… от Supabase →
// /auth/login?error=link_expired; для ссылки восстановления (next=/auth/update-password) — на саму страницу
// смены пароля: без сессии она покажет «Ссылка устарела. Запросите новую» (US-011, шаг 6).

export interface CallbackDeps {
  exchangeCodeForSession(code: string): Promise<{ error: unknown | null }>;
}

const RECOVERY_PATH = "/auth/update-password";

export function createCallbackHandler(deps: CallbackDeps) {
  return async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const next = safeNextPath(url.searchParams.get("next"));
    const failure = next === RECOVERY_PATH ? RECOVERY_PATH : "/auth/login?error=link_expired";
    const redirect = (path: string) => NextResponse.redirect(new URL(path, url.origin), { headers: { "Cache-Control": "private, no-store" } });

    const code = url.searchParams.get("code");
    if (!code || url.searchParams.has("error") || url.searchParams.has("error_code")) return redirect(failure);
    try {
      const { error } = await deps.exchangeCodeForSession(code);
      if (error) return redirect(failure);
    } catch (err) {
      console.error({ scope: "auth.callback", err });
      return redirect(failure);
    }
    return redirect(next);
  };
}
