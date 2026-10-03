-- ForgeCarbon — 20261003000000_refunds_duplicate_guard (Чертёж, 2.20; Приложение A, A34).
-- Что: не больше одного автовозврата «Повторная оплата» на каждый платёж.
-- Почему: два обработчика webhook ЮKassa (или webhook и сверка) одновременно видят лишний
--      succeeded-платёж и оба создают возврат — деньги вернулись бы дважды. Проверка в коде
--      гонку не закрывает; unique-индекс заставляет второй insert упасть с 23505.
-- Порядок: после 20261002110000_reserved_qty_map.sql.
-- Откат: drop index if exists public.uq_refunds_duplicate_payment;

-- reason — ровно та строка, которую пишет код автовозврата. Ручные возвраты админа
-- (другой reason, частичные суммы) индекс не ограничивает.
create unique index if not exists uq_refunds_duplicate_payment
  on public.refunds (payment_id)
  where reason = 'Повторная оплата';

comment on index public.uq_refunds_duplicate_payment is
  'Один автовозврат «Повторная оплата» на платёж: защита от гонки обработчиков webhook ЮKassa (A34).';
