import { createClient } from "@/lib/supabase/browser";
import { safeNextPath } from "@/lib/auth-next";

// Клиентская обёртка над supabase.auth для экранов входа/регистрации/восстановления (Блок 5, «Аутентификация»;
// Блок 4). Мутации делает сам браузерный клиент Supabase (Блок 3 отдельных /api/auth/* не определяет).
// Ошибки Supabase сводятся к AuthFailure — формы показывают тексты Блока 4 и не зависят от формулировок auth-js.
// fixtures=true (страница вычислила AUTH_FIXTURES=1 вне production) — подмена ответов без сети, чтобы экраны
// проверялись без Supabase. Заглушка намеренно встроена сюда: фикстурные модули из прод-кода не импортируются.

export type AuthFailure =
  | "invalid_credentials" | "email_not_confirmed" | "already_registered" | "rate_limited"
  | "link_expired" | "same_password" | "weak_password" | "unknown";

export type AuthResult<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; reason: AuthFailure };

export interface AuthGateway {
  signIn(email: string, password: string): Promise<AuthResult<{ role: string | null }>>;
  signUp(input: { email: string; password: string; fullName: string; next: string }): Promise<AuthResult>;
  resendSignup(email: string, next: string): Promise<AuthResult>;
  requestPasswordReset(email: string): Promise<AuthResult>;
  updatePassword(password: string): Promise<AuthResult>;
  signOut(): Promise<AuthResult>;
}

interface AuthErrorLike { code?: string; status?: number; message?: string }

export function classifyAuthError(err: AuthErrorLike): AuthFailure {
  const code = err.code ?? "";
  const message = (err.message ?? "").toLowerCase();
  if (err.status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "rate_limited";
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return "email_not_confirmed";
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return "invalid_credentials";
  if (code === "user_already_exists" || code === "email_exists" || message.includes("already registered")) return "already_registered";
  if (code === "same_password") return "same_password";
  if (code === "weak_password") return "weak_password";
  if (code === "session_not_found" || code === "bad_jwt" || message.includes("session missing")) return "link_expired";
  return "unknown";
}

function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  return (configured || window.location.origin).replace(/\/+$/, "");
}

const callbackUrl = (next: string) => `${siteUrl()}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`;

function realGateway(): AuthGateway {
  const supabase = createClient();
  const fail = (err: AuthErrorLike): { ok: false; reason: AuthFailure } => ({ ok: false, reason: classifyAuthError(err) });
  const guard = async <T>(run: () => Promise<AuthResult<T>>): Promise<AuthResult<T>> => {
    try {
      return await run();
    } catch {
      return { ok: false, reason: "unknown" };
    }
  };
  return {
    signIn: (email, password) => guard(async () => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return fail(error);
      // Роль нужна только для редиректа admin → /admin; сбой чтения роли вход не отменяет.
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      const role: unknown = profile?.role;
      return { ok: true, role: typeof role === "string" ? role : null };
    }),
    signUp: ({ email, password, fullName, next }) => guard(async () => {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName }, emailRedirectTo: callbackUrl(next) },
      });
      if (error) return fail(error);
      // Email подтверждения включён: для уже занятого email Supabase не отдаёт ошибку, а возвращает
      // «пустого» пользователя без identities (защита от перебора) — показываем «уже зарегистрирован».
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return { ok: false, reason: "already_registered" };
      }
      return { ok: true };
    }),
    resendSignup: (email, next) => guard(async () => {
      const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: callbackUrl(next) } });
      return error ? fail(error) : { ok: true };
    }),
    requestPasswordReset: (email) => guard(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl("/auth/update-password") });
      return error ? fail(error) : { ok: true };
    }),
    updatePassword: (password) => guard(async () => {
      const { error } = await supabase.auth.updateUser({ password });
      return error ? fail(error) : { ok: true };
    }),
    signOut: () => guard(async () => {
      const { error } = await supabase.auth.signOut();
      return error ? fail(error) : { ok: true };
    }),
  };
}

// Заглушка AUTH_FIXTURES=1: поведение задаёт локальная часть email («wrong», «unconfirmed», «taken», «limit», «admin»).
function fixtureGateway(): AuthGateway {
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 500));
  const has = (email: string, word: string) => email.toLowerCase().split("@")[0].includes(word);
  const common = async (email: string): Promise<AuthResult | null> => {
    await pause();
    if (has(email, "limit")) return { ok: false, reason: "rate_limited" };
    return null;
  };
  return {
    signIn: async (email) => {
      const early = await common(email);
      if (early) return early;
      if (has(email, "wrong")) return { ok: false, reason: "invalid_credentials" };
      if (has(email, "unconfirmed")) return { ok: false, reason: "email_not_confirmed" };
      return { ok: true, role: has(email, "admin") ? "admin" : "customer" };
    },
    signUp: async ({ email }) => {
      const early = await common(email);
      if (early) return early;
      return has(email, "taken") ? { ok: false, reason: "already_registered" } : { ok: true };
    },
    resendSignup: async (email) => (await common(email)) ?? { ok: true },
    requestPasswordReset: async (email) => (await common(email)) ?? { ok: true },
    updatePassword: async (password) => {
      await pause();
      return password.startsWith("same") ? { ok: false, reason: "same_password" } : { ok: true };
    },
    signOut: async () => {
      await pause();
      return { ok: true };
    },
  };
}

export function getAuthGateway(fixtures: boolean): AuthGateway {
  return fixtures ? fixtureGateway() : realGateway();
}
