import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16: proxy.ts вместо middleware.ts (Чертёж, Блок 0 «Маршруты», Блок 5.7 «Сессия»).
// Обновляет сессию Supabase (refresh токена → Set-Cookie) на защищённых страницах, на /api/* (кроме
// webhooks/cron) и на страницах витрины (/, /wheels, /carbon, /product/*, /cart, /orders/*): там Server
// Components показывают price_atelier одобренному ателье (BR-10), и сессия должна жить и на витрине.
// Защитные редиректы — только /admin/* и /account; витрина и API пропускаются всегда.
// env.ts здесь НЕ импортируется (он требует все серверные переменные) — только NEXT_PUBLIC_*.
// Роль проверяется повторно в layout /admin и в каждом /api/admin/* — proxy не единственная защита.

function isUnder(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// Блок 5.10 «Открытый редирект»: next — только относительный путь, начинается с «/», но не с «//».
function safeNext(path: string, fallback: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : fallback;
}

function redirectTo(request: NextRequest, target: string, from?: NextResponse) {
  const redirect = NextResponse.redirect(new URL(target, request.url));
  // Переносим обновлённые cookies сессии и запрет кеширования, если Supabase их выставил.
  if (from) {
    from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    const cacheControl = from.headers.get("Cache-Control");
    if (cacheControl) redirect.headers.set("Cache-Control", cacheControl);
  }
  return redirect;
}

function loginRedirect(request: NextRequest, nextPath: string, fallback: string, from?: NextResponse) {
  const target = `/auth/login?next=${encodeURIComponent(safeNext(nextPath, fallback))}`;
  return redirectTo(request, target, from);
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Webhooks и cron сессию не обновляют (дублирует matcher — защита от его правки).
  if (isUnder(pathname, "/api/webhooks") || isUnder(pathname, "/api/cron")) {
    return NextResponse.next();
  }

  const isAdminPage = isUnder(pathname, "/admin");
  // Dev-подмена (как в requireAdminPage): ADMIN_FIXTURES=1 вне production пускает на /admin без сессии.
  // Инлайн-условие — бандлер вырезает ветку из production-сборки.
  if (process.env.NODE_ENV !== "production" && process.env.ADMIN_FIXTURES === "1" && isAdminPage) {
    return NextResponse.next();
  }
  const isAccountPage = isUnder(pathname, "/account");
  const adminNext = `${pathname}${search}`;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Cookie сессии @supabase/ssr называются sb-<project-ref>-auth-token[.N]. Без них сессии нет:
  // getUser() и так не ходит в сеть (auth-js без access_token сразу возвращает AuthSessionMissingError),
  // но ранний выход не создаёт клиент на каждый гостевой запрос к витрине.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (!url || !anonKey || !hasSession) {
    // Сессии нет или её нельзя проверить: защищённые страницы — на вход, остальное — дальше.
    if (isAdminPage) return loginRedirect(request, adminNext, "/admin");
    if (isAccountPage) return loginRedirect(request, "/account", "/account");
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Только getUser() (проверка токена на сервере Supabase), не getSession().
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch (err) {
    console.error({ scope: "proxy.getUser", pathname, err });
  }

  if (isAccountPage && !userId) {
    return loginRedirect(request, "/account", "/account", response);
  }

  if (isAdminPage) {
    if (!userId) return loginRedirect(request, adminNext, "/admin", response);

    let role: string | null = null;
    try {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
      const value: unknown = profile?.role;
      role = typeof value === "string" ? value : null;
    } catch (err) {
      console.error({ scope: "proxy.profileRole", pathname, err });
    }
    if (role !== "admin") return redirectTo(request, "/", response);
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/wheels/:path*",
    "/carbon/:path*",
    "/product/:path*",
    "/cart/:path*",
    "/orders/:path*",
    "/account/:path*",
    "/admin/:path*",
    "/atelier/:path*",
    "/checkout/:path*",
    "/api/((?!webhooks/|cron/).*)",
  ],
};
