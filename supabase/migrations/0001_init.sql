-- ForgeCarbon — 0001_init: начальная схема БД (Supabase, PostgreSQL 17).
-- Источник: docs/blueprint.md, Блок 2, разделы 2.0–2.15 — дословно и в том же порядке
-- (извлечено скриптом, не перепечатано). Отклонения от Чертежа помечены «FIX(blueprint)».
-- Выполнять целиком одним запуском (Supabase SQL Editor), затем supabase/seed.sql (2.16).
-- Первый админ (2.17) в миграцию не входит — отдельный шаг, см. docs/APPLY_SQL.md.
-- Откат: supabase/rollback_0001.sql (удаляет всё, что создаёт этот файл).

-- ==== 2.0 Расширения, общие функции, последовательности ====
-- moddatetime: автообновление updated_at
create extension if not exists moddatetime with schema extensions;

-- Номер заказа: FC-26-000001
create sequence if not exists public.order_number_seq start 1;

-- FIX(blueprint): тело SQL-функции проверяется при создании (check_function_bodies = on),
-- а public.profiles создаётся только в 2.1 -> без этой строки «relation "public.profiles" does not exist».
set check_function_bodies = off;

-- Роль текущего пользователя. SECURITY DEFINER, чтобы политика на profiles
-- не вызывала рекурсию RLS при проверке роли.
create or replace function public.current_role_name()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_role_name() = 'admin', false);
$$;

-- FIX(blueprint): вернуть проверку тел функций для остальной миграции.
reset check_function_bodies;

-- ==== 2.1 profiles ====
-- Публичный профиль пользователя. Создаётся триггером при регистрации.
-- role меняет только admin (через service-role в /api/admin/ateliers/[id]);
-- пользователю выданы права UPDATE только на full_name и phone.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'customer'
              check (role in ('customer', 'atelier', 'admin')),
  full_name   text not null default '' check (char_length(full_name) <= 100),
  phone       text check (phone ~ '^\+7\d{10}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_profiles_role on public.profiles(role);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function extensions.moddatetime(updated_at);

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

-- INSERT делает только триггер handle_new_user (SECURITY DEFINER) — политики нет намеренно.

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- DELETE только каскадом из auth.users — политики нет намеренно.

-- Колоночные права: обычный пользователь не может поменять себе role.
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(left(new.raw_user_meta_data->>'full_name', 100), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==== 2.2 ateliers ====
-- Заявка и данные тюнинг-ателье. Одна заявка на аккаунт.
create table public.ateliers (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references auth.users(id) on delete cascade,
  company_name      text not null check (char_length(company_name) between 2 and 120),
  inn               text not null check (inn ~ '^(\d{10}|\d{12})$'),
  city              text not null check (char_length(city) between 2 and 80),
  contact_name      text not null check (char_length(contact_name) between 2 and 100),
  phone             text not null check (phone ~ '^\+7\d{10}$'),
  website           text check (char_length(website) <= 200),
  comment           text check (char_length(comment) <= 1000),
  status            text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  rejection_reason  text check (char_length(rejection_reason) <= 500),
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_ateliers_status on public.ateliers(status, created_at desc);
create unique index uq_ateliers_inn_approved on public.ateliers(inn) where status = 'approved';

create trigger trg_ateliers_updated_at
  before update on public.ateliers
  for each row execute function extensions.moddatetime(updated_at);

alter table public.ateliers enable row level security;

create policy "ateliers_select_own_or_admin" on public.ateliers
  for select using (auth.uid() = user_id or public.is_admin());

-- Подать заявку можно только от своего имени и только в статусе pending.
create policy "ateliers_insert_own_pending" on public.ateliers
  for insert with check (auth.uid() = user_id and status = 'pending');

-- Повторная подача после отказа: владелец может вернуть rejected → pending и поправить поля.
create policy "ateliers_update_own_resubmit" on public.ateliers
  for update using (auth.uid() = user_id and status = 'rejected')
  with check (auth.uid() = user_id and status = 'pending');

create policy "ateliers_update_admin" on public.ateliers
  for update using (public.is_admin()) with check (public.is_admin());

create policy "ateliers_delete_admin" on public.ateliers
  for delete using (public.is_admin());

-- ==== 2.3 vehicles ====
-- Справочник автомобилей для подбора. Одна строка = марка + модель + поколение.
-- Диапазоны (диаметр, ширина, вылет) — допустимые значения без доработок кузова и подвески.
-- seat_type — посадка крепежа: BMW — конус 60°, Audi — сфера R13, Mercedes-Benz — сфера R14.
create table public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  make             text not null check (make in ('Audi', 'BMW', 'Mercedes-Benz')),
  model            text not null check (char_length(model) between 1 and 60),
  generation       text not null check (char_length(generation) between 1 and 30),
  year_from        smallint not null check (year_from between 1990 and 2100),
  year_to          smallint check (year_to is null or year_to >= year_from), -- null = выпускается сейчас
  pcd              text not null check (pcd ~ '^[4-6]x\d{3}(\.\d)?$'),       -- '5x112'
  center_bore_mm   numeric(4,1) not null check (center_bore_mm between 50 and 90),
  seat_type        text not null check (seat_type in ('cone60', 'ball_r13', 'ball_r14', 'flat')),
  fastener_spec    text not null check (char_length(fastener_spec) <= 60),  -- 'Болт M14×1.25'
  diameter_min_in  smallint not null check (diameter_min_in between 15 and 24),
  diameter_max_in  smallint not null check (diameter_max_in between diameter_min_in and 24),
  width_min_in     numeric(3,1) not null check (width_min_in between 6 and 13),
  width_max_in     numeric(3,1) not null check (width_max_in >= width_min_in and width_max_in <= 13),
  et_min_mm        smallint not null check (et_min_mm between -20 and 70),
  et_max_mm        smallint not null check (et_max_mm >= et_min_mm and et_max_mm <= 70),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (make, model, generation)
);

create index idx_vehicles_make_model on public.vehicles(make, model) where is_active;
create index idx_vehicles_years on public.vehicles(year_from, year_to) where is_active;

create trigger trg_vehicles_updated_at
  before update on public.vehicles
  for each row execute function extensions.moddatetime(updated_at);

alter table public.vehicles enable row level security;

-- Справочник не секретный: читать активные может кто угодно.
create policy "vehicles_select_active_or_admin" on public.vehicles
  for select using (is_active or public.is_admin());

create policy "vehicles_insert_admin" on public.vehicles
  for insert with check (public.is_admin());

create policy "vehicles_update_admin" on public.vehicles
  for update using (public.is_admin()) with check (public.is_admin());

create policy "vehicles_delete_admin" on public.vehicles
  for delete using (public.is_admin());

-- ==== 2.4 products ====
-- Товар. type = 'wheel_set' — комплект из 4 дисков (продаётся комплектами),
-- type = 'carbon_part' — карбоновая деталь (продаётся штуками).
-- Для wheel_set заполнены все wheel-поля (CHECK ниже), для carbon_part они NULL.
-- *_rear_* = NULL означает «как спереди» (не разноширокий комплект).
create table public.products (
  id                   uuid primary key default gen_random_uuid(),
  type                 text not null check (type in ('wheel_set', 'carbon_part')),
  slug                 text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  sku                  text not null unique check (sku ~ '^[A-Z0-9-]{3,40}$'),
  title                text not null check (char_length(title) between 3 and 140),
  manufacturer         text not null check (char_length(manufacturer) between 2 and 60),
  description          text not null default '' check (char_length(description) <= 5000),
  status               text not null default 'draft' check (status in ('draft', 'active', 'archived')),

  -- Наличие
  availability_mode    text not null check (availability_mode in ('stock', 'preorder')),
  stock_qty            integer not null default 0 check (stock_qty >= 0),
  lead_time_min_days   smallint check (lead_time_min_days between 1 and 180),
  lead_time_max_days   smallint check (lead_time_max_days between 1 and 180),

  -- Цена
  purchase_currency    text not null default 'USD' check (purchase_currency in ('USD', 'CNY', 'RUB')),
  purchase_cost        integer not null check (purchase_cost > 0),            -- минимальные единицы валюты закупки
  pricing_mode         text not null default 'auto' check (pricing_mode in ('auto', 'manual')),
  price                integer not null check (price > 0),                    -- копейки, розница
  price_atelier        integer check (price_atelier is null or (price_atelier > 0 and price_atelier <= price)),
  price_updated_at     timestamptz not null default now(),

  -- Диски
  diameter_in          smallint check (diameter_in between 15 and 24),
  width_front_in       numeric(3,1) check (width_front_in between 6 and 13),
  width_rear_in        numeric(3,1) check (width_rear_in between 6 and 13),
  et_front_mm          smallint check (et_front_mm between -20 and 70),
  et_rear_mm           smallint check (et_rear_mm between -20 and 70),
  pcd                  text check (pcd ~ '^[4-6]x\d{3}(\.\d)?$'),
  center_bore_mm       numeric(4,1) check (center_bore_mm between 50 and 90),
  seat_type            text check (seat_type in ('cone60', 'ball_r13', 'ball_r14', 'flat')),
  includes_hub_rings   boolean not null default false,
  includes_fasteners   boolean not null default false,
  construction         text check (construction in ('cast', 'flow_formed', 'forged_monoblock', 'forged_2pc', 'forged_3pc')),
  finish               text check (char_length(finish) <= 60),
  weight_kg            numeric(4,1) check (weight_kg between 3 and 30),       -- вес одного диска

  -- Общие
  warranty_months      smallint not null default 12 check (warranty_months between 0 and 120),
  certifications       text[] not null default '{}',                          -- '{"TÜV","JWL","VIA"}'
  claims_verified      boolean not null default false,                        -- без true сертификации не показываются
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint chk_wheel_fields check (
    type <> 'wheel_set' or (
      diameter_in is not null and width_front_in is not null and et_front_mm is not null
      and pcd is not null and center_bore_mm is not null and seat_type is not null
      and construction is not null
    )
  ),
  constraint chk_carbon_fields check (
    type <> 'carbon_part' or (diameter_in is null and pcd is null and center_bore_mm is null)
  ),
  constraint chk_preorder_lead_time check (
    availability_mode <> 'preorder'
    or (lead_time_min_days is not null and lead_time_max_days is not null
        and lead_time_max_days >= lead_time_min_days)
  ),
  -- Карбон всегда под заказ (Идея: «карбон под заказ, 100% предоплата»).
  constraint chk_carbon_preorder check (type <> 'carbon_part' or availability_mode = 'preorder')
);

create index idx_products_type_status on public.products(type, status);
create index idx_products_fitment on public.products(pcd, diameter_in) where type = 'wheel_set' and status = 'active';
create index idx_products_price on public.products(price) where status = 'active';
create index idx_products_created on public.products(created_at desc);

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function extensions.moddatetime(updated_at);

alter table public.products enable row level security;

-- Публичное чтение идёт через сервер (service-role + явные колонки), см. «Принципы».
create policy "products_select_admin" on public.products
  for select using (public.is_admin());

create policy "products_insert_admin" on public.products
  for insert with check (public.is_admin());

create policy "products_update_admin" on public.products
  for update using (public.is_admin()) with check (public.is_admin());

-- Удаление разрешено (order_items хранят снапшот), но в UI основное действие — «В архив».
create policy "products_delete_admin" on public.products
  for delete using (public.is_admin());

-- ==== 2.5 product_images ====
create table public.product_images (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  storage_path  text not null unique,                          -- 'products/<product_id>/<uuid>.webp'
  alt           text not null default '' check (char_length(alt) <= 200),
  sort_order    smallint not null default 0 check (sort_order between 0 and 7),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_product_images_product on public.product_images(product_id, sort_order);

create trigger trg_product_images_updated_at
  before update on public.product_images
  for each row execute function extensions.moddatetime(updated_at);

alter table public.product_images enable row level security;

create policy "product_images_select_admin" on public.product_images
  for select using (public.is_admin());
create policy "product_images_insert_admin" on public.product_images
  for insert with check (public.is_admin());
create policy "product_images_update_admin" on public.product_images
  for update using (public.is_admin()) with check (public.is_admin());
create policy "product_images_delete_admin" on public.product_images
  for delete using (public.is_admin());

-- Максимум 8 фото на товар
create or replace function public.check_product_images_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.product_images where product_id = new.product_id) >= 8 then
    raise exception 'IMAGES_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_product_images_limit
  before insert on public.product_images
  for each row execute function public.check_product_images_limit();

-- ==== 2.6 product_vehicles ====
-- Явная совместимость карбоновых деталей с автомобилями.
-- Для дисков совместимость считается правилами (find_wheels_for_vehicle), эта таблица для них не используется.
create table public.product_vehicles (
  product_id  uuid not null references public.products(id) on delete cascade,
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (product_id, vehicle_id)
);

create index idx_product_vehicles_vehicle on public.product_vehicles(vehicle_id);

create trigger trg_product_vehicles_updated_at
  before update on public.product_vehicles
  for each row execute function extensions.moddatetime(updated_at);

alter table public.product_vehicles enable row level security;

create policy "product_vehicles_select_admin" on public.product_vehicles
  for select using (public.is_admin());
create policy "product_vehicles_insert_admin" on public.product_vehicles
  for insert with check (public.is_admin());
create policy "product_vehicles_update_admin" on public.product_vehicles
  for update using (public.is_admin()) with check (public.is_admin());
create policy "product_vehicles_delete_admin" on public.product_vehicles
  for delete using (public.is_admin());

-- ==== 2.7 orders ====
-- Заказ. kind = 'stock' (из наличия) или 'preorder' (под заказ). Смешивать нельзя.
-- Покупатель без аккаунта получает доступ по секретному токену; в БД хранится только SHA-256 токена.
-- Заказы не удаляются никогда (учёт, споры, возвраты).
create table public.orders (
  id                      uuid primary key default gen_random_uuid(),
  number                  text not null unique,                       -- 'FC-26-000123'
  client_request_id       uuid not null unique,                       -- защита от двойного создания
  public_token_hash       text not null unique check (public_token_hash ~ '^[a-f0-9]{64}$'),
  kind                    text not null check (kind in ('stock', 'preorder')),
  status                  text not null default 'pending_payment' check (status in (
                            'pending_payment', 'paid', 'confirmed',
                            'ordered_from_supplier', 'in_transit', 'arrived',
                            'shipped', 'delivered', 'cancelled', 'refunded')),
  user_id                 uuid references auth.users(id) on delete set null,
  atelier_id              uuid references public.ateliers(id) on delete set null,
  price_tier              text not null default 'retail' check (price_tier in ('retail', 'atelier')),

  customer_name           text not null check (char_length(customer_name) between 2 and 100),
  customer_phone          text not null check (customer_phone ~ '^\+7\d{10}$'),
  customer_email          text not null check (customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(customer_email) <= 254),

  delivery_method         text not null check (delivery_method in ('moscow_courier', 'cdek_pvz', 'cdek_door')),
  delivery_city           text not null check (char_length(delivery_city) between 2 and 80),
  delivery_address        text check (char_length(delivery_address) <= 300),       -- для courier и cdek_door
  delivery_postal_code    text check (delivery_postal_code ~ '^\d{6}$'),
  cdek_pvz_code           text check (cdek_pvz_code ~ '^[A-Z0-9]{3,20}$'),          -- для cdek_pvz
  delivery_price          integer not null default 0 check (delivery_price >= 0),  -- копейки, в MVP всегда 0

  vehicle_id              uuid references public.vehicles(id) on delete set null,
  vin                     text check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  customer_comment        text check (char_length(customer_comment) <= 1000),

  subtotal                integer not null check (subtotal > 0),                   -- копейки
  total                   integer not null check (total > 0),                      -- subtotal + delivery_price

  reserved_until          timestamptz,                                             -- бронь для kind='stock'
  paid_at                 timestamptz,
  expected_ready_at       date,                                                    -- для preorder: когда будет на складе
  shipped_at              timestamptz,
  delivered_at            timestamptz,
  cancelled_at            timestamptz,
  cancel_reason           text check (char_length(cancel_reason) <= 500),
  tracking_number         text check (tracking_number ~ '^[A-Za-z0-9-]{5,40}$'),
  courier_note            text check (char_length(courier_note) <= 300),
  admin_note              text check (char_length(admin_note) <= 2000),
  customer_visible_note   text check (char_length(customer_visible_note) <= 500), -- «Задержка на таможне»
  needs_attention         boolean not null default false,
  attention_reason        text check (char_length(attention_reason) <= 300),
  telegram_chat_id        bigint,                                                  -- подписка покупателя
  consent_pd_at           timestamptz not null,
  consent_policy_version  text not null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint chk_delivery_fields check (
    (delivery_method = 'cdek_pvz' and cdek_pvz_code is not null)
    or (delivery_method in ('moscow_courier', 'cdek_door') and delivery_address is not null)
  ),
  constraint chk_total check (total = subtotal + delivery_price)
);

create index idx_orders_status_created on public.orders(status, created_at desc);
create index idx_orders_user on public.orders(user_id, created_at desc) where user_id is not null;
create index idx_orders_attention on public.orders(created_at desc) where needs_attention;
create index idx_orders_pending_reserved on public.orders(reserved_until) where status = 'pending_payment';
create index idx_orders_email on public.orders(lower(customer_email));

create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function extensions.moddatetime(updated_at);

alter table public.orders enable row level security;

create policy "orders_select_own_or_admin" on public.orders
  for select using (auth.uid() = user_id or public.is_admin());

-- INSERT только через функцию create_order (service-role) — политики нет намеренно.

create policy "orders_update_admin" on public.orders
  for update using (public.is_admin()) with check (public.is_admin());

-- DELETE запрещён всем — политики нет намеренно.

-- ==== 2.8 order_items ====
create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete restrict,
  product_id      uuid references public.products(id) on delete set null,
  title_snapshot  text not null,                         -- название на момент заказа
  sku_snapshot    text not null,
  specs_snapshot  jsonb not null default '{}'::jsonb,    -- {"diameter_in":20,"pcd":"5x112",...}
  unit_price      integer not null check (unit_price > 0),       -- копейки
  quantity        integer not null check (quantity between 1 and 4),
  line_total      integer not null check (line_total = unit_price * quantity),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_order_items_order on public.order_items(order_id);
create index idx_order_items_product on public.order_items(product_id);

create trigger trg_order_items_updated_at
  before update on public.order_items
  for each row execute function extensions.moddatetime(updated_at);

alter table public.order_items enable row level security;

create policy "order_items_select_own_or_admin" on public.order_items
  for select using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );

-- INSERT только через create_order; UPDATE/DELETE запрещены (позиции оплаченного заказа неизменны).

-- ==== 2.9 payments ====
create table public.payments (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders(id) on delete restrict,
  yookassa_payment_id   text not null unique,              -- '30a8d2c1-000f-5000-9000-1b6c4d2e8f10'
  idempotence_key       text not null unique,
  status                text not null check (status in ('pending', 'waiting_for_capture', 'succeeded', 'canceled')),
  amount                integer not null check (amount > 0),  -- копейки
  payment_method_type   text check (payment_method_type in ('bank_card', 'sbp')),
  cancellation_reason   text,
  raw                   jsonb not null default '{}'::jsonb,   -- последний ответ ЮKassa
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_payments_order on public.payments(order_id, created_at desc);
create index idx_payments_status on public.payments(status);

create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function extensions.moddatetime(updated_at);

alter table public.payments enable row level security;

create policy "payments_select_admin" on public.payments
  for select using (public.is_admin());
-- INSERT/UPDATE — только сервер (service-role); DELETE запрещён.

-- ==== 2.10 refunds ====
create table public.refunds (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders(id) on delete restrict,
  payment_id           uuid not null references public.payments(id) on delete restrict,
  yookassa_refund_id   text unique,
  amount               integer not null check (amount > 0),
  reason               text not null check (char_length(reason) between 5 and 500),
  restock              boolean not null default false,
  status               text not null default 'pending' check (status in ('pending', 'succeeded', 'canceled', 'failed')),
  error_message        text,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_refunds_order on public.refunds(order_id);

create trigger trg_refunds_updated_at
  before update on public.refunds
  for each row execute function extensions.moddatetime(updated_at);

alter table public.refunds enable row level security;

create policy "refunds_select_admin" on public.refunds
  for select using (public.is_admin());
-- INSERT/UPDATE — только сервер; DELETE запрещён.

-- ==== 2.11 order_status_history ====
-- Журнал переходов статусов. Неизменяемый, поэтому без updated_at.
create table public.order_status_history (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete restrict,
  from_status  text,
  to_status    text not null,
  changed_by   uuid references auth.users(id) on delete set null,  -- null = система (webhook, cron)
  note         text check (char_length(note) <= 500),
  created_at   timestamptz not null default now()
);

create index idx_status_history_order on public.order_status_history(order_id, created_at);

alter table public.order_status_history enable row level security;

create policy "status_history_select_own_or_admin" on public.order_status_history
  for select using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );
-- INSERT — только сервер; UPDATE/DELETE запрещены.

-- ==== 2.12 exchange_rates, app_settings ====
-- Курсы ЦБ РФ. Одна строка на валюту и дату. Неизменяемый журнал.
create table public.exchange_rates (
  id          uuid primary key default gen_random_uuid(),
  currency    text not null check (currency in ('USD', 'CNY')),
  rate        numeric(12,4) not null check (rate > 0),     -- рублей за 1 единицу валюты
  rate_date   date not null,
  source      text not null default 'cbr',
  created_at  timestamptz not null default now(),
  unique (currency, rate_date)
);

create index idx_exchange_rates_latest on public.exchange_rates(currency, rate_date desc);

alter table public.exchange_rates enable row level security;
create policy "exchange_rates_select_admin" on public.exchange_rates
  for select using (public.is_admin());
-- INSERT — только сервер (cron); UPDATE/DELETE запрещены.

-- Настройки магазина: ровно одна строка (id = 1).
create table public.app_settings (
  id                  smallint primary key default 1 check (id = 1),
  markup_multiplier   numeric(4,2) not null default 2.00 check (markup_multiplier between 1.00 and 5.00),
  price_rounding_rub  integer not null default 100 check (price_rounding_rub in (1, 10, 100, 1000)),
  auto_reprice        boolean not null default true,   -- пересчитывать auto-цены после загрузки курса
  reprice_threshold   numeric(4,2) not null default 2.00 check (reprice_threshold between 0 and 20), -- % изменения курса
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

insert into public.app_settings (id) values (1);

create trigger trg_app_settings_updated_at
  before update on public.app_settings
  for each row execute function extensions.moddatetime(updated_at);

alter table public.app_settings enable row level security;
create policy "app_settings_select_admin" on public.app_settings
  for select using (public.is_admin());
create policy "app_settings_update_admin" on public.app_settings
  for update using (public.is_admin()) with check (public.is_admin());
-- INSERT/DELETE запрещены: строка одна, создана миграцией.

-- ==== 2.13 notification_queue, rate_limit_hits ====
-- Очередь недоставленных уведомлений (Telegram, email) для повторной отправки.
create table public.notification_queue (
  id               uuid primary key default gen_random_uuid(),
  channel          text not null check (channel in ('telegram', 'email')),
  recipient        text not null,                     -- chat_id или email
  template         text not null check (template in (
                     'admin_order_paid', 'admin_atelier_applied', 'admin_attention',
                     'customer_order_paid', 'customer_status_changed', 'customer_refund',
                     'atelier_approved', 'atelier_rejected')),
  payload          jsonb not null,
  status           text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts         smallint not null default 0 check (attempts between 0 and 10),
  last_error       text,
  next_attempt_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_notification_queue_due on public.notification_queue(next_attempt_at) where status = 'pending';

create trigger trg_notification_queue_updated_at
  before update on public.notification_queue
  for each row execute function extensions.moddatetime(updated_at);

alter table public.notification_queue enable row level security;
create policy "notification_queue_select_admin" on public.notification_queue
  for select using (public.is_admin());
-- INSERT/UPDATE/DELETE — только сервер.

-- Rate limiting без Redis: фиксированное окно в Postgres.
create table public.rate_limit_hits (
  key           text not null,             -- 'orders:203.0.113.7'
  window_start  timestamptz not null,
  hits          integer not null default 1,
  primary key (key, window_start)
);

alter table public.rate_limit_hits enable row level security;
-- Ни одной политики: таблица доступна только service-role.

create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limit_hits (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = rate_limit_hits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

-- FIX(blueprint): EXECUTE на новые функции по умолчанию выдан PUBLIC, а anon/authenticated
-- входят в PUBLIC — revoke только от anon, authenticated доступ не закрывает.
-- Отзываем и у PUBLIC; service_role (сервер) выдаём явно.
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- ==== 2.14 Функции бизнес-логики ====
-- Сколько единиц товара забронировано неоплаченными заказами с действующей бронью.
create or replace function public.reserved_qty(p_product_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(oi.quantity), 0)::integer
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.product_id = p_product_id
    and o.status = 'pending_payment'
    and o.reserved_until > now();
$$;

-- FIX(blueprint): каталог и остатки читает только сервер (service-role); через /rest/v1/rpc anon
-- видел бы остатки черновиков. create_order (SECURITY DEFINER) вызывает их с правами владельца.
revoke execute on function public.reserved_qty(uuid) from public, anon, authenticated;
grant execute on function public.reserved_qty(uuid) to service_role;

create or replace function public.available_qty(p_product_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select greatest(p.stock_qty - public.reserved_qty(p.id), 0)
  from public.products p where p.id = p_product_id;
$$;

-- FIX(blueprint): только сервер, см. reserved_qty.
revoke execute on function public.available_qty(uuid) from public, anon, authenticated;
grant execute on function public.available_qty(uuid) to service_role;

-- Подбор дисков по автомобилю.
-- ЦО диска может быть больше ЦО авто только при наличии колец в комплекте.
-- Разница ≤ 0.2 мм (66.6 vs 66.5) считается совпадением.
create or replace function public.find_wheels_for_vehicle(p_vehicle_id uuid)
returns table (product_id uuid, needs_hub_rings boolean)
language sql stable security definer set search_path = public
as $$
  select p.id, (p.center_bore_mm - v.center_bore_mm) > 0.2
  from public.products p
  join public.vehicles v on v.id = p_vehicle_id and v.is_active
  where p.type = 'wheel_set'
    and p.status = 'active'
    and p.pcd = v.pcd
    and p.diameter_in between v.diameter_min_in and v.diameter_max_in
    and p.width_front_in between v.width_min_in and v.width_max_in
    and coalesce(p.width_rear_in, p.width_front_in) between v.width_min_in and v.width_max_in
    and p.et_front_mm between v.et_min_mm and v.et_max_mm
    and coalesce(p.et_rear_mm, p.et_front_mm) between v.et_min_mm and v.et_max_mm
    and p.center_bore_mm >= v.center_bore_mm
    and ((p.center_bore_mm - v.center_bore_mm) <= 0.2 or p.includes_hub_rings)
    and (p.seat_type = v.seat_type or p.includes_fasteners);
$$;

-- FIX(blueprint): только сервер, см. reserved_qty.
revoke execute on function public.find_wheels_for_vehicle(uuid) from public, anon, authenticated;
grant execute on function public.find_wheels_for_vehicle(uuid) to service_role;

-- Создание заказа с бронью. Вызывается только сервером (service-role) из POST /api/orders.
-- p_order: {client_request_id, public_token_hash, user_id, atelier_id, customer_*, delivery_*,
--           cdek_pvz_code, vehicle_id, vin, customer_comment, consent_policy_version, expected_total}
-- p_items: [{"product_id":"...","quantity":1}]
-- Исключения (errcode P0001, message):
--   'EMPTY_CART', 'TOO_MANY_LINES', 'DUPLICATE_ITEMS', 'PRODUCT_UNAVAILABLE:<id>', 'MIXED_KINDS',
--   'QTY_LIMIT:<id>', 'OUT_OF_STOCK:<id>', 'PRICE_CHANGED'
create or replace function public.create_order(p_order jsonb, p_items jsonb)
returns table (order_id uuid, order_number text, order_total integer, order_kind text)
language plpgsql security definer set search_path = public
as $$
declare
  v_existing   record;
  v_order_id   uuid := gen_random_uuid();
  v_number     text;
  v_kind       text;
  v_tier       text := case when (p_order->>'atelier_id') is not null then 'atelier' else 'retail' end;
  v_subtotal   integer := 0;
  v_item       jsonb;
  v_p          record;
  v_qty        integer;
  v_price      integer;
begin
  -- Идемпотентность: повтор того же запроса возвращает тот же заказ.
  select o.id, o.number, o.total, o.kind into v_existing
  from public.orders o where o.client_request_id = (p_order->>'client_request_id')::uuid;
  if found then
    return query select v_existing.id, v_existing.number, v_existing.total, v_existing.kind;
    return;
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 10 then
    raise exception 'TOO_MANY_LINES' using errcode = 'P0001';
  end if;
  -- FIX(blueprint): один товар — одна строка. Иначе [{p,1},{p,1}] обходит проверку остатка
  -- (обе строки видят одинаковый резерв) и QTY_LIMIT (2+2). Сравнение по uuid, не по тексту.
  if (select count(distinct (e->>'product_id')::uuid) from jsonb_array_elements(p_items) e)
     <> jsonb_array_length(p_items) then
    raise exception 'DUPLICATE_ITEMS' using errcode = 'P0001';
  end if;

  -- Первый проход: блокировка строк товаров, проверки, сумма.
  -- FIX(blueprint): блокируем строки в едином порядке (по product_id), чтобы два
  -- одновременных заказа с теми же товарами в разном порядке не ловили deadlock.
  for v_item in select value from jsonb_array_elements(p_items) order by (value->>'product_id')::uuid loop
    v_qty := (v_item->>'quantity')::integer;

    select * into v_p from public.products
    where id = (v_item->>'product_id')::uuid
    for update;

    if not found or v_p.status <> 'active' then
      raise exception 'PRODUCT_UNAVAILABLE:%', v_item->>'product_id' using errcode = 'P0001';
    end if;

    if v_kind is null then
      v_kind := v_p.availability_mode;
    elsif v_kind <> v_p.availability_mode then
      raise exception 'MIXED_KINDS' using errcode = 'P0001';
    end if;

    if v_qty < 1
       or (v_p.type = 'wheel_set' and v_qty > 2)
       or (v_p.type = 'carbon_part' and v_qty > 4) then
      raise exception 'QTY_LIMIT:%', v_p.id using errcode = 'P0001';
    end if;

    if v_p.availability_mode = 'stock'
       and (v_p.stock_qty - public.reserved_qty(v_p.id)) < v_qty then
      raise exception 'OUT_OF_STOCK:%', v_p.id using errcode = 'P0001';
    end if;

    v_price := case when v_tier = 'atelier' and v_p.price_atelier is not null
                    then v_p.price_atelier else v_p.price end;
    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  if v_subtotal <> (p_order->>'expected_total')::integer then
    raise exception 'PRICE_CHANGED' using errcode = 'P0001';
  end if;

  v_number := 'FC-' || to_char(now() at time zone 'Europe/Moscow', 'YY') || '-'
              || lpad(nextval('public.order_number_seq')::text, 6, '0');

  insert into public.orders (
    id, number, client_request_id, public_token_hash, kind, status,
    user_id, atelier_id, price_tier,
    customer_name, customer_phone, customer_email,
    delivery_method, delivery_city, delivery_address, delivery_postal_code, cdek_pvz_code, delivery_price,
    vehicle_id, vin, customer_comment,
    subtotal, total, reserved_until, consent_pd_at, consent_policy_version
  ) values (
    v_order_id, v_number, (p_order->>'client_request_id')::uuid, p_order->>'public_token_hash', v_kind, 'pending_payment',
    nullif(p_order->>'user_id', '')::uuid, nullif(p_order->>'atelier_id', '')::uuid, v_tier,
    p_order->>'customer_name', p_order->>'customer_phone', lower(p_order->>'customer_email'),
    p_order->>'delivery_method', p_order->>'delivery_city', nullif(p_order->>'delivery_address', ''),
    nullif(p_order->>'delivery_postal_code', ''), nullif(p_order->>'cdek_pvz_code', ''), 0,
    nullif(p_order->>'vehicle_id', '')::uuid, nullif(upper(p_order->>'vin'), ''), nullif(p_order->>'customer_comment', ''),
    v_subtotal, v_subtotal,
    now() + interval '30 minutes',  -- бронь (для preorder — срок на оплату)
    now(), p_order->>'consent_policy_version'
  );

  -- Второй проход: позиции со снапшотами.
  insert into public.order_items (order_id, product_id, title_snapshot, sku_snapshot, specs_snapshot, unit_price, quantity, line_total)
  select v_order_id, p.id, p.title, p.sku,
         jsonb_strip_nulls(jsonb_build_object(
           'type', p.type, 'diameter_in', p.diameter_in, 'width_front_in', p.width_front_in,
           'width_rear_in', p.width_rear_in, 'et_front_mm', p.et_front_mm, 'et_rear_mm', p.et_rear_mm,
           'pcd', p.pcd, 'center_bore_mm', p.center_bore_mm, 'lead_time_max_days', p.lead_time_max_days)),
         case when v_tier = 'atelier' and p.price_atelier is not null then p.price_atelier else p.price end,
         (i->>'quantity')::integer,
         (case when v_tier = 'atelier' and p.price_atelier is not null then p.price_atelier else p.price end)
           * (i->>'quantity')::integer
  from jsonb_array_elements(p_items) i
  join public.products p on p.id = (i->>'product_id')::uuid;

  insert into public.order_status_history (order_id, from_status, to_status, note)
  values (v_order_id, null, 'pending_payment', 'Заказ создан');

  return query select v_order_id, v_number, v_subtotal, v_kind;
end;
$$;

-- FIX(blueprint): revoke и от PUBLIC, см. комментарий у check_rate_limit.
revoke execute on function public.create_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(jsonb, jsonb) to service_role;

-- Отметка об оплате. Идемпотентна. Вызывается из webhook ЮKassa после повторной проверки платежа.
-- Возвращает: 'paid' | 'already_paid' | 'paid_needs_attention'
create or replace function public.mark_order_paid(p_order_id uuid, p_amount integer)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_o        record;
  v_item     record;
  v_attention text := null;
  v_lead     integer;
begin
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_o.status not in ('pending_payment', 'cancelled') then
    return 'already_paid';
  end if;

  if p_amount <> v_o.total then
    v_attention := format('Сумма платежа %s коп. не равна сумме заказа %s коп.', p_amount, v_o.total);
  end if;

  if v_o.status = 'cancelled' then
    v_attention := coalesce(v_attention || '; ', '') || 'Оплачен после истечения брони';
  end if;

  if v_o.kind = 'stock' then
    for v_item in
      select oi.product_id, oi.quantity from public.order_items oi
      where oi.order_id = p_order_id and oi.product_id is not null
    loop
      update public.products
      set stock_qty = stock_qty - v_item.quantity
      where id = v_item.product_id and stock_qty >= v_item.quantity;
      if not found then
        v_attention := coalesce(v_attention || '; ', '') || 'Не хватило остатка по товару ' || v_item.product_id;
      end if;
    end loop;
  else
    select max((oi.specs_snapshot->>'lead_time_max_days')::integer) into v_lead
    from public.order_items oi where oi.order_id = p_order_id;
  end if;

  update public.orders set
    status = 'paid',
    paid_at = now(),
    reserved_until = null,
    cancelled_at = null,
    cancel_reason = null,
    expected_ready_at = case when kind = 'preorder'
                             then ((now() at time zone 'Europe/Moscow')::date + coalesce(v_lead, 35))
                             else null end,
    needs_attention = v_attention is not null,
    attention_reason = v_attention
  where id = p_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, note)
  values (p_order_id, v_o.status, 'paid', coalesce(v_attention, 'Оплата подтверждена ЮKassa'));

  return case when v_attention is null then 'paid' else 'paid_needs_attention' end;
end;
$$;

-- FIX(blueprint): revoke и от PUBLIC, см. комментарий у check_rate_limit.
revoke execute on function public.mark_order_paid(uuid, integer) from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid, integer) to service_role;

-- Отмена неоплаченных заказов с истёкшей бронью. Вызывается cron и лениво при открытии заказа.
create or replace function public.cancel_expired_orders()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  with expired as (
    update public.orders
    set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Не оплачен за 30 минут'
    where status = 'pending_payment' and reserved_until < now()
    returning id
  )
  insert into public.order_status_history (order_id, from_status, to_status, note)
  select id, 'pending_payment', 'cancelled', 'Бронь истекла' from expired;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- FIX(blueprint): revoke и от PUBLIC, см. комментарий у check_rate_limit.
revoke execute on function public.cancel_expired_orders() from public, anon, authenticated;
grant execute on function public.cancel_expired_orders() to service_role;

-- Возврат товара на склад при возврате денег (kind = 'stock').
create or replace function public.restock_order(p_order_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.products p
  set stock_qty = p.stock_qty + oi.quantity
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.order_id = p_order_id and oi.product_id = p.id and o.kind = 'stock';
$$;

-- FIX(blueprint): revoke и от PUBLIC, см. комментарий у check_rate_limit.
revoke execute on function public.restock_order(uuid) from public, anon, authenticated;
grant execute on function public.restock_order(uuid) to service_role;

-- ==== 2.15 Storage ====
-- Публичный бакет для фото товаров: читать может кто угодно по прямой ссылке,
-- загружать/удалять — только admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "product_images_bucket_insert_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

create policy "product_images_bucket_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

create policy "product_images_bucket_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- FIX(blueprint): Storage API (remove, upsert, list) находит объекты через SELECT —
-- без этой политики замена и удаление фото в админке падают. Нужна только admin:
-- публичный бакет отдаёт файлы по URL без проверки политик
-- https://<project-ref>.supabase.co/storage/v1/object/public/product-images/<path>
create policy "product_images_bucket_select_admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
