---
name: create-migration
description: "Creates a Supabase SQL migration for ForgeCarbon with RLS, policies, indexes and comments. Use when the database schema needs to change after the initial 0001_init.sql."
---
Создай миграцию в `supabase/migrations/` для: $ARGUMENTS

Делегируй работу субагенту `database-architect`, если задача больше одной таблицы или затрагивает функции/RLS.

1. **Проверка.** Прочитай все существующие миграции (`supabase/migrations/*.sql`) и Блок 2 `docs/blueprint.md`, чтобы не создать дубликат и не нарушить связи. Начальная миграция — `0001_init.sql`; её не редактируй.
2. **Имя файла:** `YYYYMMDDHHMMSS_<описание_snake_case>.sql` (текущее время UTC, например `20261005143000_add_product_tags.sql`).
3. **Содержимое (в этом порядке):**
   - Комментарий-шапка: что делает миграция, ПОЧЕМУ, как откатить.
   - `CREATE TABLE` / `ALTER TABLE`: `id uuid primary key default gen_random_uuid()`, `created_at`, `updated_at timestamptz not null default now()`; деньги — `integer` в копейках; CHECK-ограничения; FK с явным `ON DELETE`.
   - Триггер `updated_at`: `create trigger trg_<table>_updated_at before update on public.<table> for each row execute function extensions.moddatetime(updated_at);`
   - RLS: `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;`
   - Политики: `CREATE POLICY "<table>_<op>_<who>" …` для каждой нужной операции через `auth.uid()` / `public.is_admin()`; для запрещённых — комментарий «политики нет намеренно».
   - Индексы: `CREATE INDEX idx_<table>_<cols> …` для FK и фильтров.
   - Функции (если есть): `security definer set search_path = public` + `revoke execute … from anon, authenticated`; ошибки `errcode = 'P0001'`.
   - `COMMENT ON TABLE/COLUMN` для документации.
4. **Применение.** Если доступен Supabase MCP — выполни миграцию и проверь политики запросами от anon / customer / admin. Иначе — сообщи команду `npx supabase db push`.
5. **Типы.** Обнови TypeScript-типы: `npx supabase gen types typescript --project-id $PROJECT_REF > src/types/database.ts` (если есть доступ).
6. **Чертёж.** Если миграция меняет модель данных из Блока 2 — сообщи пользователю, какой раздел Чертежа нужно обновить.
