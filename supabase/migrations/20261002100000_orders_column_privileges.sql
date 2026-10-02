-- ForgeCarbon — 20261002100000_orders_column_privileges (Чертёж, 2.18; Приложение A, A23).
-- Что: покупателю на сессионном клиенте (роль authenticated) видны только «покупательские» колонки
--      своих заказов и истории статусов; служебные поля скрыты колоночными правами.
-- Почему: политика orders_select_own_or_admin отбирает строки, но не колонки. Через PostgREST
--      (anon-ключ + JWT покупателя) он читал admin_note, attention_reason, needs_attention,
--      telegram_chat_id, public_token_hash, client_request_id и order_status_history.note.
--      Админка читает заказы и историю через service-role после проверки роли
--      (is_admin() на сессионном клиенте этих колонок больше не даёт — так задумано).
-- Порядок: после 0001_init.sql. Откат — команды в конце файла.

-- Сначала снимаем табличное SELECT (выдано API-ролям по умолчанию Supabase), затем выдаём колонки.
-- anon заказов не читает вовсе: гость видит заказ только через сервер по токену.
revoke select on public.orders from anon, authenticated;

-- Скрыты: admin_note, attention_reason, needs_attention, telegram_chat_id,
-- public_token_hash, client_request_id. courier_note и customer_visible_note покупатель видит (US-004).
-- id и user_id обязательны: на них ссылаются политики order_items и order_status_history.
grant select (
  id, number, kind, status, user_id, atelier_id, price_tier,
  customer_name, customer_phone, customer_email,
  delivery_method, delivery_city, delivery_address, delivery_postal_code, cdek_pvz_code, delivery_price,
  vehicle_id, vin, customer_comment,
  subtotal, total,
  reserved_until, paid_at, expected_ready_at, shipped_at, delivered_at, cancelled_at, cancel_reason,
  tracking_number, courier_note, customer_visible_note,
  consent_pd_at, consent_policy_version, created_at, updated_at
) on public.orders to authenticated;

-- note (внутренние пометки, суммы расхождений) и changed_by (id админа) скрыты.
revoke select on public.order_status_history from anon, authenticated;

grant select (id, order_id, from_status, to_status, created_at)
  on public.order_status_history to authenticated;

-- order_items не меняется: снапшоты позиций покупателю видны целиком.

-- Откат (SQL Editor):
--   grant select on public.orders to anon, authenticated;
--   grant select on public.order_status_history to anon, authenticated;
