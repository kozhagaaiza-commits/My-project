import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16: proxy.ts вместо middleware.ts (Чертёж, Блок 0 «Маршруты», Блок 5.7 «Сессия»).
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
  const isAccountPage = isUnder(pathname, "/account");
  const adminNext = `${pathname}${search}`;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Без Supabase сессию проверить нельзя: защищённые страницы — на вход, остальное — дальше.
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
    "/account/:path*",
    "/admin/:path*",
    "/atelier/:path*",
    "/checkout/:path*",
    "/api/((?!webhooks/|cron/).*)",
  ],
};
