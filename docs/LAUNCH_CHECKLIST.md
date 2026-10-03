# Подготовка к запуску ForgeCarbon: ключи и настройки по кабинетам

Список для владельца. Делайте по порядку: каждый следующий кабинет использует данные предыдущего.
Ключи в чат не вставляйте и в код не записывайте: они хранятся только в Vercel (Settings → Environment Variables).
Подробности по Telegram и почте — `docs/SETUP_NOTIFICATIONS.md`, по базе — `docs/APPLY_SQL.md`.

## Порядок

1. Vercel: создать проект, получить адрес сайта.
2. Supabase: база, ключи, настройки входа.
3. Яндекс Почта: ящик и пароль приложения.
4. Telegram: бот и chat id.
5. ЮKassa: магазин, ключи, уведомления.
6. Яндекс Метрика: счётчик и цели.
7. Vercel: все переменные, деплой, cron.
8. Проверка тестовым заказом на 1 ₽.

## 1. Vercel (сначала — создать проект)

- [ ] Войти на vercel.com, **Add New → Project**, импортировать репозиторий `kozhagaaiza-commits/my-project`, ветку для продакшна выбрать (после слияния — `main`).
- [ ] Framework: Next.js (определится сам). Команды сборки менять не нужно.
- [ ] Запомнить адрес сайта (например `https://forgecarbon.vercel.app`): он нужен в `NEXT_PUBLIC_SITE_URL`, в Supabase, ЮKassa и Telegram.
- [ ] Тариф Hobby: cron работает раз в сутки (06:00 UTC), это учтено в коде.
- [ ] Settings → Environment Variables → добавить переменные из раздела 7 (окружение **Production**).
- [ ] После добавления или изменения переменных — **Redeploy** (Deployments → три точки → Redeploy).
- [ ] После деплоя: Settings → Cron Jobs — должна быть задача `/api/cron/daily`.

## 2. Supabase

Создать проект на supabase.com (регион ближе к Москве/Европе, пароль БД сохранить в менеджере паролей).

База данных (SQL Editor, по порядку; подробно в `docs/APPLY_SQL.md`):
- [ ] `supabase/migrations/0001_init.sql` — вся схема и бакет `product-images`.
- [ ] `supabase/seed.sql` — справочник автомобилей (запускать один раз).
- [ ] `supabase/migrations/20261002100000_orders_column_privileges.sql`.
- [ ] `supabase/migrations/20261002110000_reserved_qty_map.sql`.
- [ ] `supabase/migrations/20261003000000_refunds_duplicate_guard.sql`.
- [ ] Проверочные запросы из шага 4 `APPLY_SQL.md` дали ожидаемый результат.
- [ ] Storage: бакет `product-images` есть, пометка Public.

Ключи (Settings → API) → в Vercel:
- [ ] `NEXT_PUBLIC_SUPABASE_URL` — Project URL, вида `https://<ref>.supabase.co`.
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — ключ `anon public`.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — ключ `service_role` (секретный, только сервер). Ранее использовавшийся ключ перевыпустить (Reset) и вписать новый.
- [ ] Anon и service_role не перепутаны: `anon` — публичный, `service_role` — секретный.

Вход пользователей (Authentication):
- [ ] URL Configuration → **Site URL** = адрес сайта; **Redirect URLs**: `<адрес сайта>/auth/callback` и `http://localhost:3000/auth/callback`.
- [ ] Providers → Email: **Confirm email = ON**, **Secure password change = ON**, минимальная длина пароля **8**.
- [ ] Settings → SMTP: включить Custom SMTP: хост `smtp.yandex.ru`, порт `465`, логин и пароль приложения из раздела 3, отправитель — тот же ящик. Без этого письма Supabase идут только участникам проекта.
- [ ] Email Templates: русские шаблоны Confirm signup и Reset password; ссылка — `{{ .ConfirmationURL }}`.
- [ ] Письмо со ссылкой приходит и ссылка ведёт на сайт (`/auth/callback`).

Первый админ:
- [ ] Зарегистрироваться на сайте через `/auth/register`, подтвердить email.
- [ ] В SQL Editor выполнить (подставить свой email):
  `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'ВАШ_EMAIL');`
- [ ] Войти — открывается `/admin`.

## 3. Яндекс Почта (для писем покупателям и Supabase)

- [ ] Ящик для писем (например `orders@вашдомен.ru` или обычный ящик на yandex.ru).
- [ ] id.yandex.ru/security/app-passwords → создать **пароль приложения** (тип «Почта»), скопировать сразу.
- [ ] Почта → Настройки → Почтовые программы → доступ по протоколу включён.
- [ ] В Vercel: `SMTP_USER` — адрес ящика; `SMTP_PASSWORD` — пароль приложения (не обычный пароль!).
- [ ] `SMTP_HOST` и `SMTP_PORT` не нужны (по умолчанию `smtp.yandex.ru` и `465`).

## 4. Telegram

- [ ] @BotFather → `/newbot` → название и username (оканчивается на `bot`) → получить токен.
- [ ] @userinfobot → ваш числовой `Id` (это chat id админа).
- [ ] Открыть своего бота и нажать «Запустить» (иначе он не сможет вам писать).
- [ ] В Vercel:
  - `TELEGRAM_BOT_TOKEN` — токен от BotFather;
  - `TELEGRAM_BOT_USERNAME` — имя бота без `@`;
  - `TELEGRAM_ADMIN_CHAT_ID` — ваш chat id;
  - `TELEGRAM_WEBHOOK_SECRET` — случайная строка 32–64 символа из `A–Z a–z 0–9 _ -`.
- [ ] После деплоя зарегистрировать webhook: `npx tsx scripts/set-telegram-webhook.ts --dry-run`, затем без флагов, затем `--info` (или запасная ссылка в браузере — `docs/SETUP_NOTIFICATIONS.md`, шаг 5).
- [ ] Проверка: с другого аккаунта написать боту `/start` — приходит приветствие; текст или фото пересылается вам.

## 5. ЮKassa

- [ ] Магазин создан и подключён (юрлицо/ИП/самозанятый, договор подписан); пока идёт модерация — работать в **тестовом магазине**.
- [ ] Включены только способы оплаты **«Банковские карты»** и **«СБП»**.
- [ ] Чеки по 54-ФЗ: подключена отправка чеков (собственная касса или «Чеки от ЮKassa»); система налогообложения магазина совпадает с вашей. В коде в чеке: ставка НДС — код 1 (без НДС), признак расчёта «полная предоплата», предмет «товар». Если вы на НДС или другой системе — сообщите, код поменяем.
- [ ] Интеграция → Ключи API: `shopId` → `YOOKASSA_SHOP_ID`, секретный ключ → `YOOKASSA_SECRET_KEY` (для теста — ключи тестового магазина, для боя — боевые).
- [ ] Интеграция → **HTTP-уведомления**: URL `<адрес сайта>/api/webhooks/yookassa`; события `payment.succeeded`, `payment.canceled`, `refund.succeeded`.
- [ ] Тест: оплата тестовой картой из документации ЮKassa → заказ становится «Оплачен».
- [ ] При переходе на боевой магазин заменить `YOOKASSA_SHOP_ID` и `YOOKASSA_SECRET_KEY`, Redeploy.

## 6. Яндекс Метрика

- [ ] metrika.yandex.ru → создать счётчик для адреса сайта.
- [ ] **Вебвизор выключен**, карта кликов выключена (код их не включает).
- [ ] Номер счётчика → в Vercel `NEXT_PUBLIC_YM_COUNTER_ID` (только цифры).
- [ ] Добавить 7 целей, тип «JavaScript-событие», идентификатор цели — ровно такой:
  `fitment_selected`, `product_view`, `add_to_cart`, `checkout_started`, `payment_succeeded`, `telegram_subscribed`, `atelier_applied`.
- [ ] После деплоя: Метрика получает просмотры (вкладка «Мониторинг»), в `/admin` счётчика нет.

## 7. Все переменные для Vercel (Production)

| Переменная | Откуда |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | адрес сайта с `https://`, без `/` на конце |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role |
| `YOOKASSA_SHOP_ID` | ЮKassa → Интеграция |
| `YOOKASSA_SECRET_KEY` | ЮKassa → Интеграция → Ключи API |
| `TELEGRAM_BOT_TOKEN` | @BotFather |
| `TELEGRAM_BOT_USERNAME` | имя бота без `@` |
| `TELEGRAM_WEBHOOK_SECRET` | случайная строка 32+ символа |
| `TELEGRAM_ADMIN_CHAT_ID` | @userinfobot |
| `SMTP_USER` | ящик Яндекса |
| `SMTP_PASSWORD` | пароль приложения Яндекса |
| `CRON_SECRET` | случайная строка 32+ символа |
| `ORDER_TOKEN_SECRET` | случайная строка 32+ символа; **после запуска не менять** (сломает ссылки на заказы) |
| `NEXT_PUBLIC_YM_COUNTER_ID` | номер счётчика Метрики |

Случайные строки генерируйте менеджером паролей (длина 40, буквы и цифры). Каждую — отдельную.
Не нужны в проде: `TELEGRAM_API_URL`, `LEGAL_CHECK`, `*_FIXTURES`. Не задавайте их.

Если сайт при сборке падает с ошибкой про переменные — в логе Vercel названа недостающая.

## 8. В репозитории и вне кабинетов

- [ ] `src/lib/legal.ts`: заменить заглушки (ИП, ИНН, ОГРНИП, email) реальными реквизитами.
- [ ] Вычитать у юриста `/offer` и `/privacy` (политика по Чертежу не называет Яндекс, Telegram, Supabase — риск 152-ФЗ).
- [ ] Подать уведомление об обработке персональных данных на pd.rkn.gov.ru.
- [ ] Справочник автомобилей сверить с инженером; завести 20 позиций дисков и 5–10 карбона (админка → Товары).
- [ ] Курс ЦБ: `/admin/settings` → «Загрузить сейчас»; проверить множитель наценки и шаг округления.

## 9. Проверка перед открытием

- [ ] Vercel → Cron Jobs → Run: ответ 200, курс загружен.
- [ ] Тестовый заказ на 1 ₽ (товар с ручной ценой, статус draft → active на время теста): оплата → Telegram админу и письмо покупателю в течение минуты → смена статусов до «Доставлен» → возврат из админки.
- [ ] После теста вернуть товару обычную цену и статус draft.
- [ ] Страница заказа открывается по ссылке из письма; кнопка «Получать статусы в Telegram» работает.
- [ ] В консоли браузера нет ошибок CSP на витрине, чекауте и `/admin`; оплата ЮKassa и возврат на сайт проходят.
- [ ] Перевыпущенные ключи не попали в чаты и репозиторий.
