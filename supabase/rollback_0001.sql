-- ForgeCarbon — откат миграции 0001_init.sql.
-- ВНИМАНИЕ: удаляет ВСЕ таблицы магазина вместе с данными (заказы, товары, профили).
-- Применять только сразу после 0001 (до следующих миграций), если установку нужно начать заново.
-- Можно запускать повторно: все команды с «if exists».
-- Расширение moddatetime не удаляется (общее для проекта, не мешает повторной установке).

begin;

-- 2.15 Storage: политики и бакет.
drop policy if exists "product_images_bucket_insert_admin" on storage.objects;
drop policy if exists "product_images_bucket_update_admin" on storage.objects;
drop policy if exists "product_images_bucket_delete_admin" on storage.objects;
drop policy if exists "product_images_bucket_select_admin" on storage.objects;

-- Бакет удаляется только пустым; Supabase может запрещать прямой DELETE из storage-таблиц.
-- Ошибку не пропускаем дальше, чтобы откат остальной схемы не отменился, — выводим подсказку.
do $$
begin
  delete from storage.buckets where id = 'product-images';
exception when others then
  raise notice 'Бакет product-images не удалён (%). Удалите его вручную: Storage → product-images → Delete bucket.', sqlerrm;
end
$$;

-- 2.1 Триггер на auth.users: снимаем первым, иначе регистрация сломается без public.profiles.
drop trigger if exists on_auth_user_created on auth.users;

-- 2.14 и 2.13 Функции бизнес-логики.
drop function if exists public.restock_order(uuid);
drop function if exists public.cancel_expired_orders();
drop function if exists public.mark_order_paid(uuid, integer);
drop function if exists public.create_order(jsonb, jsonb);
drop function if exists public.find_wheels_for_vehicle(uuid);
drop function if exists public.available_qty(uuid);
drop function if exists public.reserved_qty(uuid);
drop function if exists public.check_rate_limit(text, integer, integer);

-- 2.13 → 2.1 Таблицы в обратном порядке (политики, индексы и триггеры удаляются вместе с таблицами).
drop table if exists public.rate_limit_hits;
drop table if exists public.notification_queue;
drop table if exists public.app_settings;
drop table if exists public.exchange_rates;
drop table if exists public.order_status_history;
drop table if exists public.refunds;
drop table if exists public.payments;
drop table if exists public.order_items;
drop table if exists public.orders;
drop table if exists public.product_vehicles;
drop table if exists public.product_images;
drop function if exists public.check_product_images_limit();
drop table if exists public.products;
drop table if exists public.vehicles;
drop table if exists public.ateliers;
drop table if exists public.profiles;
drop function if exists public.handle_new_user();

-- 2.0 Общие функции и последовательность (после таблиц: на is_admin() ссылаются политики).
drop function if exists public.is_admin();
drop function if exists public.current_role_name();
drop sequence if exists public.order_number_seq;

commit;

-- Итог отката — видимая строка в результатах (NOTICE в SQL Editor легко пропустить).
select case
  when exists (select 1 from storage.buckets where id = 'product-images')
    then 'УДАЛИТЕ БАКЕТ product-images ВРУЧНУЮ (Storage → product-images → Delete bucket)'
  else 'ok: бакета нет, можно запускать 0001 заново'
end as result;
