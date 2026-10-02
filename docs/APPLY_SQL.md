# Как применить базу данных в Supabase

Делается один раз, в Supabase Dashboard → **SQL Editor**. Порядок важен.

Файлы:
- `supabase/migrations/0001_init.sql` — вся схема (таблицы, защита RLS, функции, бакет для фото);
- `supabase/seed.sql` — справочник автомобилей (13 строк);
- `supabase/rollback_0001.sql` — откат (нужен только при ошибке, см. шаг 5).

## 1. Открыть редактор
Dashboard → проект → **SQL Editor** → **New query**.

## 2. Схема
1. Откройте `supabase/migrations/0001_init.sql`, скопируйте **всё содержимое целиком** (около 950 строк).
2. Вставьте в пустой запрос → **Run**.
3. Ожидаемый результат: **Success. No rows returned**.

## 3. Справочник автомобилей
1. **New query** → вставьте всё содержимое `supabase/seed.sql` → **Run**.
2. Ожидаемый результат: **Success. No rows returned**.

Запускать один раз. Повторный запуск даст ошибку
`duplicate key value violates unique constraint "vehicles_make_model_generation_key"` — это значит, что справочник уже загружен, ничего не изменилось.

## 4. Проверка
Выполните в **New query** по очереди:

```sql
select count(*) from public.vehicles;
```
Ожидается: `13`.

```sql
select * from public.app_settings;
```
Ожидается: 1 строка (`id = 1`, `markup_multiplier = 2.00`).

```sql
select has_function_privilege('anon', 'public.create_order(jsonb,jsonb)', 'execute');
```
Ожидается: `false` (посетители сайта не могут создавать заказы в обход сервера).

Затем: Dashboard → **Storage** → в списке есть бакет **product-images** с пометкой Public.

## 5. Если что-то пошло не так
- **Ошибка `relation "profiles" already exists`** (или другое `already exists`) при запуске `0001_init.sql` — схема уже установлена. Повторно запускать не нужно; проверьте шагом 4.
- **Любая другая ошибка** — не правьте SQL сами. Скопируйте полный текст ошибки и отправьте разработчику.
- **Нужно начать заново** (первый запуск упал на середине, или проверка шага 4 не проходит):
  1. **New query** → вставьте всё содержимое `supabase/rollback_0001.sql` → **Run**. Редактор предупредит о «destructive operation» — подтвердите.
  2. **Внимание:** откат удаляет все таблицы магазина вместе с данными. Применять только на этапе первой установки.
  3. Если в результатах есть сообщение `Бакет product-images не удалён…` — удалите его вручную: **Storage** → `product-images` → **Delete bucket**.
  4. Повторите шаги 2–4.

## 6. Первый админ
Роль admin через сайт не выдаётся — только этим SQL (Чертёж, 2.17).

1. Создайте пользователя:
   - после Дня 7 сборки — зарегистрируйтесь на сайте через `/auth/register` и подтвердите email;
   - до этого — Dashboard → **Authentication** → **Users** → **Add user** → **Create new user**: email, пароль, отметьте **Auto Confirm User**.
2. **New query** → выполните, заменив email на свой:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'owner@forgecarbon.ru');
```

3. Проверка (тот же email):

```sql
select role from public.profiles
where id = (select id from auth.users where email = 'owner@forgecarbon.ru');
```
Ожидается: `admin`. Если строк нет — пользователь был создан **до** шага 2; сообщите разработчику.

## 7. Настройки входа (позже, перед Днём 7)
Dashboard → **Authentication** (подробно — Чертёж, Блок 5.7):
- **URL Configuration**: Site URL = адрес сайта; Redirect URLs: `<адрес сайта>/auth/callback` и `http://localhost:3000/auth/callback`.
- **Providers → Email**: Confirm email = ON, Secure password change = ON, минимум 8 символов в пароле.
- **SMTP Settings**: свой SMTP Яндекса (`smtp.yandex.ru`, порт `465`, отправитель `ForgeCarbon`). Без него письма подтверждения не дойдут до ателье.
- **Email Templates**: русские шаблоны «Подтвердите email», «Сброс пароля».

## Для разработчика
- Если позже применять миграции через CLI (`npx supabase db push`), сначала отметьте 0001 как применённую, иначе CLI попытается выполнить её повторно: `npx supabase migration repair --status applied 0001`.
- Типы: `npx supabase gen types typescript --project-id $PROJECT_REF > src/types/database.ts`.
