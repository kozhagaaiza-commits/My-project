# ForgeCarbon

## Обзор
Интернет-магазин кованых/литых дисков (склад в Москве, доставка до 5 дней) и карбоновых деталей под заказ из Китая для Audi, BMW, Mercedes-Benz. Подбор дисков по авто (PCD, вылет, ЦО), 100% предоплата картой/СБП через ЮKassa, опт для тюнинг-ателье.

## Источник истины
- **Чертёж — `docs/blueprint.md`.** Перед любой задачей прочитай нужный блок: 0 — обзор/стек/маршруты, 1 — User Stories, 2 — SQL, 3 — API, 4 — UI, 5 — бизнес-логика, 6 — Edge Cases.
- Код, SQL, Zod-схемы, тексты и коды ошибок из Чертежа переносятся **дословно**. Не выдумывай поля, статусы, тексты интерфейса.
- Если задача противоречит Чертежу — остановись и спроси. Решения вне Идеи — Приложение A.

## Стек
- Next.js 16 (App Router, Turbopack), React 19.2, TypeScript strict, Tailwind CSS v4
- shadcn/ui (`new-york`, `neutral`), lucide-react, sonner, react-hook-form + zod 4
- Supabase: PostgreSQL 17, Auth (email+пароль), RLS, Storage; `@supabase/ssr`
- ЮKassa API v3 (карта + СБП), Telegram Bot API, nodemailer (SMTP Яндекса), курсы ЦБ РФ (XML)
- Яндекс Метрика; деплой — Vercel (Route Handlers + Vercel Cron)
- **Не используем:** Stripe, OpenAI, Supabase Edge Functions, Redis, Beget VPS, платные SaaS. Бюджет 0 ₽.

## Архитектура
```
src/app/(shop)/…        витрина: /, /wheels, /carbon, /product/[slug], /cart, /checkout, /orders/[number], /atelier, /account
src/app/auth/…          login, register, forgot-password, update-password, callback/route.ts
src/app/admin/…         админка (layout проверяет role=admin)
src/app/api/…           Route Handlers — ВСЕ мутации (см. Блок 3)
src/components/ui|shop|admin
src/lib/                config, env, money, pricing, order-status, catalog, auth, api-error, rate-limit,
                        yookassa, telegram, mailer, cbr, analytics, legal, notifications/, schemas/, supabase/{server,browser,admin}.ts
src/proxy.ts            обновление сессии + редиректы (в Next.js 16 вместо middleware.ts)
supabase/migrations/0001_init.sql, supabase/seed.sql, vercel.json, scripts/
```
- Server Components по умолчанию; `'use client'` — только для интерактива.
- **Server Actions для мутаций НЕ используются** — только Route Handlers `src/app/api/**/route.ts`.
- Каталог читается публично только через сервер (service-role + `PUBLIC_PRODUCT_COLUMNS`). Service-role клиент — только в местах из Блока 5.10. Исключение (решение владельца, День 2): служебные колонки `orders` (admin_note, attention_reason, needs_attention, telegram_chat_id, public_token_hash, client_request_id) и `order_status_history.note` скрыты колоночными правами — `/api/admin/orders*` и страница заказа читают заказы через service-role ПОСЛЕ проверки роли/владельца, сессионный клиент этих колонок не видит.
- Заказы создаются и оплачиваются только через SQL-функции `create_order` / `mark_order_paid`.

## Правила кодирования
- TypeScript strict, без `any`. Где в Чертеже `any` — пиши `unknown` и сужай тип, логику не меняй.
- Именование: camelCase — переменные, PascalCase — компоненты, snake_case — таблицы/колонки БД и поля JSON API.
- Один компонент = один файл, до 200 строк. Импорты через `@/`.
- async — всегда try/catch; `error.tsx` / Error Boundaries для страниц.
- **Деньги — целые копейки** (`13370000` = 133 700 ₽). Вывод только через `formatRub`. Никаких float-сумм.
- Даты: в БД `timestamptz`, на экране `Europe/Moscow`.
- Env — только через `src/lib/env.ts` (на сервере); клиент читает лишь `NEXT_PUBLIC_*`.
- Ответы API: `{ data }` / `{ data, meta }` / `{ error: { code, message, details? } }` через `apiError()`.
- Zod-схемы — в `src/lib/schemas/`, одна схема на клиенте и сервере.
- Тексты интерфейса — русские, короткие, фактологичные. Запрещены: «хит продаж», «скидка», «акция», «последний шанс», «дёшево».
- Одна жёлтая (`variant="default"`) кнопка на экран. Тема только тёмная.
- Нет `console.log` в продакшн-коде (`console.error` для 500 — допустимо).

## Работа с Supabase
- Все изменения схемы — миграции в `supabase/migrations/`. Первая — `0001_init.sql` (весь SQL Блока 2 в его порядке), дальше `YYYYMMDDHHMMSS_описание.sql`.
- RLS включена на каждой таблице. Отсутствие политики = запрет — подписывай комментарием «политики нет намеренно».
- SECURITY DEFINER функции: `set search_path = public` + `revoke execute … from public, anon, authenticated` + `grant execute … to service_role` (EXECUTE по умолчанию выдан PUBLIC — одного revoke от anon/authenticated мало).
- Типы: `npx supabase gen types typescript --project-id $PROJECT_REF > src/types/database.ts`

## Context7
При работе с любыми внешними библиотеками (Next.js, React, Supabase, Tailwind, shadcn, Zod, react-hook-form и т.д.)
ВСЕГДА используй Context7 MCP для получения актуальной документации перед написанием кода.
Добавляй "use context7" к запросам, связанным с API библиотек. Особенно: Next.js 16 (`proxy.ts`, async `params`), Tailwind v4, Zod 4 (`z.email()`, `z.flattenError`).
Если Context7 недоступен (закрыта сеть) — документация Next.js лежит локально в `node_modules/next/dist/docs/` (см. `AGENTS.md`), типы и README остальных пакетов — в их `node_modules/<пакет>/`. Не пиши API по памяти.
shadcn/ui: если `ui.shadcn.com` недоступен, исходники компонентов берутся из `raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/`.

## Команды
- `npm run dev` — локальная разработка
- `npm run build` — сборка (падает, если пусты константы `src/lib/legal.ts`)
- `npm run lint` — линтинг; `npm run typecheck` — проверка типов (`next typegen` + `tsc`; без typegen падает на `LayoutProps`)
- `npm test` — модульные тесты (встроенный `node:test`, без БД)
- `CATALOG_FIXTURES=1 npm run dev` — витрина на демо-данных без Supabase (только dev; в production-сборку не попадает)
- `npx supabase db push` — применить миграции
- `npx tsx scripts/set-telegram-webhook.ts` — регистрация webhook бота

## Порядок сборки (Чертёж, Блок 0)
1. Каркас, тема, Supabase, миграция 0001, seed, env.ts → 2. Подбор по авто, каталоги → 3. Карточка, корзина, cart/validate → 4. Checkout, ЮKassa, webhook → 5. Страница заказа, письма, Telegram → 6. Админка → 7. Статичные страницы, cron, Метрика, адаптив, Edge Cases → 8–12. Опт для ателье (флаг `FEATURE_ATELIER`).
Промпты по дням — `docs/START_BUILD.md`. Новые фичи — по `SPEC_TEMPLATE.md`.

**Каркас:** `create-next-app` не ставится в непустую папку. Создай проект во временной папке и перенеси файлы, не затирая `CLAUDE.md`, `.claude/`, `.mcp.json`, `docs/`, `SPEC_TEMPLATE.md`.

## Субагенты
| Агент | Модель | Когда |
|-------|--------|-------|
| `database-architect` | opus | SQL, миграции, RLS, функции БД, seed, Storage-политики |
| `backend-engineer` | opus | Route Handlers, Zod, авторизация, proxy.ts, rate limit, статусы заказов, цены |
| `payments-specialist` | opus | ЮKassa: платежи, чеки, webhook, сверка, возвраты |
| `integrations-engineer` | sonnet | Telegram-бот, письма SMTP, очередь уведомлений, курсы ЦБ, cron, Vercel, Метрика |
| `frontend-developer` | sonnet | Страницы, компоненты, формы, состояния, адаптив |
| `qa-reviewer` | sonnet | Ревью после каждой фичи (только чтение) |

## Skills
- `implement-feature` — реализация фичи/дня сборки с делегированием субагентам
- `create-migration` — новая SQL-миграция Supabase
- `create-api-route` — новый Route Handler по соглашениям Блока 3
