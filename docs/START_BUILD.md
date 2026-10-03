# Запуск автономной сборки ForgeCarbon

Наладка завершена: `CLAUDE.md`, 6 субагентов, 6 rules, 3 skills, `SPEC_TEMPLATE.md`, MCP. Дальше — этап «Сборка» по дням из Чертежа (Блок 0, «Порядок сборки»).

Каждый день — отдельный промпт. Вставляй его в Claude Code в начале рабочей сессии (лучше в новом чате или после `/clear`, чтобы контекст был чистым). Следующий день начинай, только когда выполнен критерий «Готово, когда».

## Перед Днём 1 (делает владелец, 15 минут)
1. Создать проект в Supabase (free tier, регион — ближайший к Москве) и скопировать `Project URL`, `anon`, `service_role` ключи.
2. Подключить Supabase MCP (команда в `docs/mcp-setup.md`).
3. Создать тестовый магазин ЮKassa, бота в @BotFather, пароль приложения Яндекс Почты — можно позже, к Дням 4–5.

---

## День 1 — каркас и база
```
Используй skill implement-feature. День 1 сборки по Чертежу (docs/blueprint.md, Блок 0 «Порядок сборки»):
Next.js 16 + TypeScript strict + Tailwind v4 + shadcn/ui (new-york, neutral, все компоненты из Блока 4.0), тёмная тема и токены из 4.0, шрифты Inter и JetBrains Mono,
src/lib/config.ts, env.ts, money.ts, api-error.ts, supabase/{server,browser,admin}.ts, proxy.ts, .env.example, .gitignore,
supabase/migrations/0001_init.sql (весь SQL Блока 2, 2.0–2.15, дословно), supabase/seed.sql (2.16), vercel.json.
create-next-app не ставится в непустую папку — создай каркас во временной папке и перенеси, не затирая CLAUDE.md, .claude/, .mcp.json, docs/, SPEC_TEMPLATE.md.
Готово, когда: select * from vehicles возвращает 13 строк seed, npm run build и npm run lint проходят.
```

## День 2 — подбор по авто и каталоги
```
Используй skill implement-feature. День 2: US-001 и US-002.
API: /api/vehicles/* (makes, models, years, resolve, [id]), /api/products, /api/products/[slug], src/lib/catalog.ts.
UI: главная (Hero, VehicleSelector, витрины), /wheels, /carbon, VehicleBadge в шапке, SiteHeader/SiteFooter, ProductCard, AvailabilityBadge, FitmentNote, PriceTag.
Готово, когда: по BMW 5 Series G30 2020 видны только подходящие диски, все критерии приёмки US-001 выполнены.
```

## День 3 — карточка и корзина
```
Используй skill implement-feature. День 3: экран «Карточка товара», корзина в localStorage (fc_cart_v1), CartSheet, /cart, POST /api/cart/validate, правило MIXED_KINDS в UI.
Готово, когда: корзина переживает перезагрузку, цены и наличие сверяются с БД, Edge Cases 12, 13, 17 обработаны.
```

## День 4 — оформление и оплата
```
Используй skill implement-feature. День 4: US-003. /checkout, POST /api/orders, src/lib/yookassa.ts, POST /api/webhooks/yookassa, mark_order_paid, POST /api/orders/[number]/pay, сверка платежей.
Платёжную часть делает payments-specialist. Ключи — тестового магазина ЮKassa.
Готово, когда: тестовый платёж ЮKassa переводит заказ в paid только по webhook; повторный клик не создаёт второй заказ.
```

## День 5 — статус заказа и уведомления
```
Используй skill implement-feature. День 5: US-004. /orders/[number] (PaymentBanner, OrderTimeline, TrackingCard), GET /api/orders/[number],
src/lib/telegram.ts, mailer.ts, notifications/ (все шаблоны 5.9.2 + notification_queue), POST /api/webhooks/telegram, scripts/set-telegram-webhook.ts.
Готово, когда: админ получает сообщение в Telegram об оплате, покупатель — письмо со ссылкой на заказ, подписка /start o_<token> работает.
```

## День 6 — админка
```
Используй skill implement-feature. День 6: US-006, US-007, US-008. Admin layout, /admin (сводка), /admin/orders, /admin/orders/[id] (статусы, трек, возврат),
/admin/products (+ форма, фото в Storage), /admin/vehicles, /admin/settings; все /api/admin/* кроме ateliers; src/lib/order-status.ts, pricing.ts.
Готово, когда: админ проводит заказ от paid до delivered и делает возврат в тестовом режиме ЮKassa.
```

## День 7 — статичные страницы, cron, полировка
```
Используй skill implement-feature. День 7: /delivery, /warranty, /privacy, /offer, /contacts (MDX, src/lib/legal.ts, проверка в next.config.ts), заголовки безопасности,
src/lib/cbr.ts, GET /api/cron/daily (6 шагов 5.12), /api/admin/exchange-rates/refresh, /api/admin/prices/recalculate, Яндекс Метрика (src/lib/analytics.ts, 7 целей),
auth-экраны (US-011), /account, адаптив всех экранов. Затем qa-reviewer проверяет все 46 Edge Cases Блока 6.
Готово, когда: чек-лист Блока 6 пройден.
```

## Дни 8–12 (запас) — опт для ателье
```
Используй skill implement-feature. Функция 5 «Опт для ателье»: US-009, US-010. /atelier, AtelierApplyForm, GET /api/ateliers/me, POST /api/ateliers,
/admin/ateliers, PATCH /api/admin/ateliers/[id], цены ателье в каталоге и заказе. Всё за флагом FEATURE_ATELIER.
Готово, когда: одобренное ателье видит и оплачивает price_atelier, остальные — нет (BR-10).
```

---

## Новые фичи после MVP
Заполни `SPEC_TEMPLATE.md` и отправь:
```
Используй skill implement-feature. Вот спецификация фичи:
[вставь заполненный SPEC_TEMPLATE.md]
```

## Перед запуском в продакшн
Пройди Приложение B Чертежа (чек-лист запуска вне кода) и прочитай «Известные риски» в Приложении A.
