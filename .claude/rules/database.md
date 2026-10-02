---
description: Правила для работы с базой данных ForgeCarbon (Supabase / PostgreSQL 17)
paths:
  - "supabase/**"
  - "src/types/database.ts"
  - "src/**/*database*"
  - "src/**/*migration*"
---
- Источник схемы — `docs/blueprint.md`, Блок 2. `0001_init.sql` = весь SQL 2.0–2.15 дословно и в том же порядке; `seed.sql` = 2.16.
- Все изменения схемы — только новой миграцией `supabase/migrations/YYYYMMDDHHMMSS_описание.sql`; применённые миграции не редактируются.
- RLS обязательна для каждой таблицы; отсутствие политики подписывается комментарием «политики нет намеренно».
- `products`, `product_images`, `product_vehicles` читает только admin — публичный каталог идёт через сервер.
- Именование таблиц: snake_case, множественное число. `id uuid default gen_random_uuid()`, `created_at`, `updated_at` + триггер `moddatetime` (кроме журналов).
- Деньги — `integer` в копейках; закупка — в минимальных единицах валюты.
- FK всегда с явным `ON DELETE`: заказы, платежи, возвраты, история — `RESTRICT`; заказы не удаляются никогда (BR-15).
- Индексы для FK и частых фильтров.
- SECURITY DEFINER: `set search_path = public` + `revoke execute … from anon, authenticated`.
- Бизнес-ошибки функций — `errcode = 'P0001'` с кодами из 2.14; формат сообщений не менять (их парсит бэкенд).
- После изменения схемы — обнови `src/types/database.ts` (`npx supabase gen types typescript`).
