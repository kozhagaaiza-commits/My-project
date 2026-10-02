-- ForgeCarbon — 20261002110000_reserved_qty_map (Чертёж, 2.19; Приложение A, A24).
-- Что: функция reserved_qty_map() — брони по всем товарам одним вызовом (product_id → reserved).
-- Почему: витрина считала брони запросами со списками id в URL и упиралась в лимит PostgREST
--      (1000 строк) и длину URL. Функция без параметров-списков снимает обе проблемы.
-- Порядок: после 20261002100000_orders_column_privileges.sql.
-- Откат: drop function if exists public.reserved_qty_map();

-- Условие брони совпадает с reserved_qty() из 2.14 (pending_payment и действующая бронь),
-- иначе витрина и create_order разойдутся в остатках.
-- Товары без броней в результат не попадают: для них reserved = 0.
create or replace function public.reserved_qty_map()
returns table (product_id uuid, reserved integer)
language sql stable security definer set search_path = public
as $$
  select oi.product_id, sum(oi.quantity)::integer
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.product_id is not null
    and o.status = 'pending_payment'
    and o.reserved_until > now()
  group by oi.product_id;
$$;

-- Остатки читает только сервер (service-role), как и reserved_qty / available_qty.
revoke execute on function public.reserved_qty_map() from public, anon, authenticated;
grant execute on function public.reserved_qty_map() to service_role;

comment on function public.reserved_qty_map() is
  'Брони неоплаченных заказов с действующей бронью по всем товарам: product_id → reserved. Условие как в reserved_qty(). Только service-role.';
