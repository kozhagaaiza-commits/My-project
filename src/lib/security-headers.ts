// Заголовки безопасности (Блок 5.10 «Заголовки», next.config.ts → headers() для /(.*)). Чистые функции: без env, server-only
// и алиасов `@/` — файл подключается из next.config.ts и тестируется node:test.
//
// Отступления от Блока 5.10 (Приложение A): к пяти заголовкам Чертежа добавлен Content-Security-Policy (BACKLOG «Заголовки
// безопасности», 5.11/5.10 — вебвизор выключен, сторонние ресурсы только перечисленные ниже).
//  - script-src содержит 'unsafe-inline': Next.js встраивает inline-скрипты гидратации; CSP с nonce требует динамического
//    рендеринга ВСЕХ страниц (proxy.ts + отказ от статики и CDN-кэша), что противоречит бесплатному тарифу Vercel. 'unsafe-eval' —
//    только в dev (React dev-режим / Turbopack HMR).
//  - Метрика: скрипт https://mc.yandex.ru/metrika/tag.js (+ yastatic.net), пиксель и отправка хитов — mc.yandex.ru / mc.yandex.com.
//  - ЮKassa: оплата — переход верхнего уровня на confirmation_url (window.location.assign), CSP на навигацию верхнего уровня не
//    влияет; сторонние фреймы и скрипты ЮKassa не подключаются (form-action 'self': платёжных HTML-форм на сайте нет).
//  - Supabase: Storage-фото (img-src) и вызовы Auth/PostgREST из браузера (connect-src) — origin из NEXT_PUBLIC_SUPABASE_URL.
//  - frame-ancestors 'none' дублирует X-Frame-Options: DENY (старые браузеры понимают только его).

export interface HeaderEntry { key: string; value: string }

export interface SecurityHeadersOptions {
  /** production-сборка; в dev: 'unsafe-eval', ws:// для HMR, без HSTS и upgrade-insecure-requests. */
  production: boolean;
  /** NEXT_PUBLIC_SUPABASE_URL; пусто / не URL → любой https://*.supabase.co. */
  supabaseUrl?: string;
}

const METRIKA_HOSTS = ["https://mc.yandex.ru", "https://mc.yandex.com"] as const;

function supabaseOrigin(url: string | undefined): string {
  if (!url) return "https://*.supabase.co";
  try {
    return new URL(url).origin;
  } catch {
    return "https://*.supabase.co";
  }
}

export function buildCsp({ production, supabaseUrl }: SecurityHeadersOptions): string {
  const supabase = supabaseOrigin(supabaseUrl);
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(production ? [] : ["'unsafe-eval'"]), "https://mc.yandex.ru", "https://yastatic.net"]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", supabase, ...METRIKA_HOSTS]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", supabase, ...METRIKA_HOSTS, ...(production ? [] : ["ws://localhost:*", "ws://127.0.0.1:*"])]],
    ["frame-src", [...METRIKA_HOSTS]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];
  const parts = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (production) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(opts: SecurityHeadersOptions): HeaderEntry[] {
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    // HSTS только в production: на http://localhost заголовок игнорируется, но кэшировать его в dev незачем.
    ...(opts.production ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
    { key: "Content-Security-Policy", value: buildCsp(opts) },
  ];
}
