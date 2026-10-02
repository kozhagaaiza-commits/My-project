# ForgeCarbon — Техническая спецификация

> Версия: 1.0 | Дата: 2026-10-01 | Статус: Production-ready
> Источник: «Идея — магазин кованых дисков и карбона для Audi, BMW, Mercedes» (30.09.2026)
> Этот документ — единственный источник истины для автономной сборки через Claude Code. Всё, чего нет в Идее, решено здесь и обосновано. Сводка этих решений — в Приложении A в конце.

---

## 0. Обзор проекта

### Что это

ForgeCarbon — интернет-магазин кованых и литых дисков (склад в Москве, доставка до 5 дней) и карбоновых деталей под заказ из Китая для Audi, BMW и Mercedes-Benz. Покупатель выбирает свой автомобиль, видит только подходящие по разболтовке, вылету и ЦО диски с отметкой наличия и оплачивает заказ полностью картой или через СБП.

«ForgeCarbon» — рабочее название. Оно хранится в одной константе `SITE_NAME` в файле `src/lib/config.ts` и меняется в одном месте.

### Стек

| Слой | Технология | Версия |
|------|-----------|--------|
| Фреймворк | Next.js (App Router, Route Handlers, Server Components, Server Actions не используются для мутаций — только Route Handlers) | 16.x |
| UI-рантайм | React | 19.2.x |
| Язык | TypeScript, `"strict": true` | 5.x |
| Стили | Tailwind CSS | 4.x |
| Компоненты | shadcn/ui (стиль `new-york`, базовый цвет `neutral`) | актуальная |
| Иконки | lucide-react | актуальная |
| Тосты | sonner (через shadcn `Sonner`) | актуальная |
| Формы | react-hook-form + @hookform/resolvers | 7.x |
| Валидация | zod | 4.x |
| БД / Auth / Storage | Supabase: PostgreSQL 17, Auth (email+пароль), RLS, Storage | free tier |
| Клиент Supabase | @supabase/supabase-js 2.x + @supabase/ssr | актуальная |
| Платежи | ЮKassa API v3 (банковская карта + СБП на платёжной странице ЮKassa) | v3 |
| Уведомления | Telegram Bot API (админу и покупателю по подписке) | — |
| Почта | nodemailer через SMTP Яндекс Почты (`smtp.yandex.ru:465`) | 7.x |
| Курсы валют | XML ЦБ РФ `https://www.cbr.ru/scripts/XML_daily.asp` | — |
| Аналитика | Яндекс Метрика (цели — см. Блок 5) | — |
| Деплой | Vercel (фронт + Route Handlers + Vercel Cron) | Hobby |

**Не используются:** Stripe, OpenAI, Supabase Edge Functions, n8n, Cursor, Lovable, Redis, платные SaaS. Бюджет инфраструктуры — 0 ₽ (ограничение из Идеи).

**Beget VPS не нужен:** вся серверная логика помещается в Route Handlers Next.js на Vercel.

### Переменные окружения

Файл `.env.local` (локально) и Environment Variables в Vercel. В коде обращаться только через `src/lib/env.ts`, который валидирует их Zod-схемой при старте и падает с понятной ошибкой, если переменной нет.

```bash
NEXT_PUBLIC_SITE_URL=https://forgecarbon.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co   # из Supabase → Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=                                # Supabase → Settings → API → anon public
SUPABASE_SERVICE_ROLE_KEY=                                    # Supabase → Settings → API → service_role (только сервер)
YOOKASSA_SHOP_ID=                                             # ЮKassa → Интеграция → shopId
YOOKASSA_SECRET_KEY=                                          # ЮKassa → Интеграция → Ключи API
TELEGRAM_BOT_TOKEN=                                           # @BotFather
TELEGRAM_BOT_USERNAME=forgecarbon_bot
TELEGRAM_WEBHOOK_SECRET=                                      # случайная строка 32+ символа [A-Za-z0-9_-]
TELEGRAM_ADMIN_CHAT_ID=                                       # id чата/группы админа
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=orders@forgecarbon.ru                               # ящик на Яндексе
SMTP_PASSWORD=                                                # пароль приложения Яндекса
CRON_SECRET=                                                  # случайная строка 32+ символа
NEXT_PUBLIC_YM_COUNTER_ID=                                    # номер счётчика Яндекс Метрики
```

`src/lib/env.ts`:

```ts
import { z } from "zod";

const serverSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  YOOKASSA_SHOP_ID: z.string().regex(/^\d+$/),
  YOOKASSA_SECRET_KEY: z.string().min(10),
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[A-Za-z0-9_-]{30,}$/),
  TELEGRAM_BOT_USERNAME: z.string().min(5),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
  TELEGRAM_ADMIN_CHAT_ID: z.string().regex(/^-?\d+$/),
  SMTP_HOST: z.string().min(3),
  SMTP_PORT: z.coerce.number().int(),
  SMTP_USER: z.email(),
  SMTP_PASSWORD: z.string().min(8),
  CRON_SECRET: z.string().min(32),
  NEXT_PUBLIC_YM_COUNTER_ID: z.string().regex(/^\d*$/).default(""),
});

export const env = serverSchema.parse(process.env);
```

Клиентские компоненты импортируют только `NEXT_PUBLIC_*` напрямую из `process.env`, никогда `env.ts`.

### Роли пользователей

| Роль | Как появляется | Описание | Доступ |
|------|---------------|----------|--------|
| `guest` (покупатель без аккаунта) | Не логинился | Частный владелец Audi/BMW/Mercedes. Основной покупатель MVP | Каталог, подбор, корзина (localStorage), оформление и оплата заказа, страница статуса своего заказа по секретной ссылке, подписка на статусы в Telegram |
| `customer` | Зарегистрировался, но заявку ателье не подавал или её отклонили | Владелец аккаунта без оптовых цен | Всё, что guest + личный кабинет `/account` со списком своих заказов |
| `atelier` | Админ одобрил заявку ателье | Тюнинг-ателье | Всё, что customer + оптовые цены `price_atelier` в каталоге и при оформлении |
| `admin` | Назначается вручную SQL-запросом (см. Блок 5, «Создание первого админа») | Владелец магазина / консультант-инженер | Панель `/admin`: товары, автомобили, наличие, заказы, статусы, трек-номера, возвраты, заявки ателье, курс и пересчёт цен |

Покупатель-розница **не обязан** регистрироваться: регистрация — лишний шаг для человека, который пришёл за одним комплектом раз в несколько лет. Аккаунт нужен только ателье (функция 5) и админу.

### Маршруты

| Путь | Экран | Доступ |
|------|-------|--------|
| `/` | Главная: подбор по авто + витрина | Публичный |
| `/wheels` | Каталог дисков (фильтр по авто через `?vehicle=<uuid>`) | Публичный |
| `/carbon` | Каталог карбона (фильтр по авто через `?vehicle=<uuid>`) | Публичный |
| `/product/[slug]` | Карточка товара | Публичный |
| `/cart` | Корзина | Публичный |
| `/checkout` | Оформление заказа | Публичный |
| `/orders/[number]?t=<token>` | Статус заказа (сюда возвращает ЮKassa) | По секретному токену / владелец / admin |
| `/atelier` | Условия для ателье + форма заявки | Публичный (форма — после входа) |
| `/auth/login` | Вход | Публичный |
| `/auth/register` | Регистрация | Публичный |
| `/auth/forgot-password` | Запрос сброса пароля | Публичный |
| `/auth/update-password` | Новый пароль (по ссылке из письма) | Сессия восстановления |
| `/auth/callback` | Route Handler обмена кода Supabase на сессию | Служебный |
| `/account` | Мои заказы и статус заявки ателье | customer, atelier |
| `/delivery` | Доставка и оплата | Публичный |
| `/warranty` | Гарантия и возврат | Публичный |
| `/privacy` | Политика обработки персональных данных | Публичный |
| `/offer` | Публичная оферта | Публичный |
| `/contacts` | Контакты | Публичный |
| `/admin` | Сводка: новые заказы, заявки, остатки | admin |
| `/admin/orders` | Список заказов | admin |
| `/admin/orders/[id]` | Заказ: статусы, трек, возврат | admin |
| `/admin/products` | Список товаров | admin |
| `/admin/products/new` | Новый товар | admin |
| `/admin/products/[id]` | Редактирование товара | admin |
| `/admin/vehicles` | Справочник автомобилей | admin |
| `/admin/ateliers` | Заявки ателье | admin |
| `/admin/settings` | Курс валют, множитель наценки, пересчёт цен | admin |

Защита маршрутов: файл `src/proxy.ts` (в Next.js 16 `middleware.ts` переименован в `proxy.ts`) обновляет сессию Supabase через `@supabase/ssr` и делает redirect:
- `/admin/*` без сессии → `/auth/login?next=<путь>`; с сессией, но `role <> 'admin'` → `/` (проверка роли повторяется в layout `/admin` на сервере и в каждом `/api/admin/*`).
- `/account` без сессии → `/auth/login?next=/account`.

### Структура проекта

```
src/
  app/
    (shop)/layout.tsx              # Header + Footer, тёмная тема
    (shop)/page.tsx                # /
    (shop)/wheels/page.tsx
    (shop)/carbon/page.tsx
    (shop)/product/[slug]/page.tsx
    (shop)/cart/page.tsx
    (shop)/checkout/page.tsx
    (shop)/orders/[number]/page.tsx
    (shop)/atelier/page.tsx
    (shop)/account/page.tsx
    (shop)/(static)/delivery|warranty|privacy|offer|contacts/page.tsx
    auth/login|register|forgot-password|update-password/page.tsx
    auth/callback/route.ts
    admin/layout.tsx               # Sidebar + Main, проверка role=admin
    admin/page.tsx
    admin/orders/page.tsx, admin/orders/[id]/page.tsx
    admin/products/page.tsx, admin/products/new/page.tsx, admin/products/[id]/page.tsx
    admin/vehicles/page.tsx
    admin/ateliers/page.tsx
    admin/settings/page.tsx
    api/...                        # см. Блок 3
  components/
    ui/                            # shadcn
    shop/                          # VehicleSelector, ProductCard, AvailabilityBadge, CartSheet, ...
    admin/                         # OrdersTable, ProductForm, ...
  lib/
    config.ts                      # SITE_NAME, константы бизнес-правил
    env.ts
    money.ts                       # formatRub(kopecks)
    supabase/server.ts             # createServerClient (cookies)
    supabase/admin.ts              # service-role клиент, только сервер
    supabase/browser.ts
    yookassa.ts
    telegram.ts
    mailer.ts
    cbr.ts
    rate-limit.ts
    api-error.ts                   # apiError(code, message, status)
    schemas/                       # все Zod-схемы из Блока 3
  proxy.ts
supabase/
  migrations/0001_init.sql         # весь SQL из Блока 2 в указанном порядке
  seed.sql                         # см. Блок 2, «Seed»
vercel.json                        # cron
```

### Порядок сборки (под 35–42 часа + 4–5 дней запаса)

| День | Что собрать | Готово, когда |
|------|-------------|---------------|
| 1 | Next.js + Tailwind + shadcn, тема, Supabase-проект, миграция 0001, seed, `env.ts` | `select * from vehicles` возвращает seed |
| 2 | Подбор по авто (US-001), каталог дисков и карбона (US-002) | По BMW 5 G30 2020 видны только подходящие диски |
| 3 | Карточка товара, корзина (localStorage), `POST /api/cart/validate` | Корзина переживает перезагрузку, цены сверяются с БД |
| 4 | Checkout, `POST /api/orders`, ЮKassa, webhook, `mark_order_paid` | Тестовый платёж ЮKassa переводит заказ в `paid` |
| 5 | Страница статуса заказа, письма, Telegram админу и покупателю | Админ получает сообщение в Telegram об оплате |
| 6 | Админка: товары, изображения, автомобили, заказы, статусы, трек, возврат | Админ проводит заказ от `paid` до `delivered` |
| 7 | Статичные и юридические страницы, cron курса, Метрика, адаптив, Edge Cases | Чек-лист Блока 6 пройден |
| 8–12 (запас) | Функция 5 «Опт для ателье» (US-007, US-008). Если не успевается — выключается флагом `FEATURE_ATELIER=false` в `config.ts`, маршруты `/atelier` и `/admin/ateliers` скрываются | — |

Функция 5 собирается последней, как требует Идея. Флаг `FEATURE_ATELIER` по умолчанию `true`.

### Константы бизнес-правил (`src/lib/config.ts`)

```ts
export const SITE_NAME = "ForgeCarbon";
export const FEATURE_ATELIER = true;
export const CURRENCY = "RUB";
export const RESERVATION_MINUTES = 30;          // бронь товара на время оплаты
export const MAX_WHEEL_SETS_PER_LINE = 2;        // комплектов одного диска в заказе
export const MAX_CARBON_QTY_PER_LINE = 4;
export const MAX_LINES_PER_ORDER = 10;
export const MOSCOW_DELIVERY_DAYS = { min: 1, max: 2 };
export const REGION_DELIVERY_DAYS = { min: 2, max: 5 };
export const PRICE_ROUNDING_RUB = 100;           // цена округляется вверх до 100 ₽
export const PRIVACY_POLICY_VERSION = "2026-10-01";
export const ORDER_PAGE_SIZE = 20;
export const CATALOG_PAGE_SIZE = 24;
```

---
## БЛОК 1: User Stories

### US-001: Подбор дисков по автомобилю

**Как** владелец BMW 5 серии G30 2020 года, который уже менял диски и знает, что такое вылет,
**я хочу** выбрать марку, модель и год и увидеть только подходящие диски,
**чтобы** не ошибиться в разболтовке, вылете и центральном отверстии.

**Сценарий:**
1. Покупатель открывает `/`. Над первым экраном — `VehicleSelector`: три `Select` «Марка», «Модель», «Год».
2. Выбирает «BMW» → подгружаются модели BMW (`GET /api/vehicles/models?make=BMW`).
3. Выбирает «5 Series» → подгружаются годы, по которым есть записи (2017–2025).
4. Выбирает «2020». Если на этот год приходится одно поколение (G30) — `vehicle_id` определяется сразу. Если два (например, 2016–2017 у F10/G30) — появляется четвёртый `Select` «Поколение» со значениями «F10 (2010–2016)» и «G30 (2017–2023)».
5. Нажимает «Показать диски» → переход на `/wheels?vehicle=<uuid>`. Выбранный автомобиль сохраняется в `localStorage` под ключом `fc_vehicle` и показывается в шапке как `Badge` «BMW 5 Series G30 · 2017–2023» с кнопкой сброса (иконка `X`).
6. Каталог показывает только диски, прошедшие функцию `find_wheels_for_vehicle` (Блок 2). На каждой карточке — параметры «R20 · 8.5J/9.5J · 5×112 · ET 30/40 · ЦО 66.6».
7. **Ошибка — подходящих дисков нет:** показывается Empty-состояние «Для BMW 5 Series G30 в наличии сейчас нет подходящих дисков» и кнопка «Написать инженеру» (ссылка на Telegram-бот с параметром `start=fit_<vehicle_id>`).
8. **Ошибка — API недоступен:** `Select` «Модель» остаётся заблокированным, под ним inline-текст «Не удалось загрузить модели. Повторить» (кнопка повторяет запрос).

**Критерии приёмки:**
- [ ] В списке марок только Audi, BMW, Mercedes-Benz (из таблицы `vehicles`, `is_active = true`).
- [ ] Диск с PCD 5×120 не показывается для автомобиля с PCD 5×112.
- [ ] Диск с ЦО меньше ЦО автомобиля не показывается никогда.
- [ ] Диск с ЦО больше ЦО автомобиля показывается с пометкой «Центровочные кольца в комплекте» (только если `includes_hub_rings = true`, иначе не показывается).
- [ ] Выбранный автомобиль сохраняется между визитами (localStorage) и применяется к `/wheels` и `/carbon`.
- [ ] Ссылка `/wheels?vehicle=<uuid>` открывается у другого человека с тем же результатом.
- [ ] Невалидный или неактивный `vehicle` в URL → каталог без фильтра + toast «Автомобиль не найден, показаны все диски».

### US-002: Наличие и срок на карточке

**Как** владелец Audi RS6 C8, которому диски нужны к сезону,
**я хочу** сразу видеть, лежит ли комплект в Москве или едет под заказ, и когда я его получу,
**чтобы** решить, покупать сейчас или искать дальше.

**Сценарий:**
1. Покупатель открывает `/product/forged-m01-r22-5x112-gloss-black`.
2. Видит галерею (до 8 фото), название, цену за комплект из 4 дисков, `AvailabilityBadge`:
   - «В наличии в Москве» (зелёная точка) + «Москва — 1–2 дня, регионы — 2–5 рабочих дней», если `available_qty > 0`;
   - «Под заказ · 21–35 дней» (серебряная точка), если `availability_mode = 'preorder'`;
   - «Нет в наличии» (серая точка), если `availability_mode = 'stock'` и `available_qty = 0`.
3. Видит таблицу характеристик: диаметр, ширина перед/зад, вылет перед/зад, PCD, ЦО, тип посадки крепежа, конструкция, вес диска, покрытие, гарантия.
4. Если в `localStorage` есть автомобиль — блок «Подходит для BMW 5 Series G30» (иконка `CircleCheck`) или «Не подходит для BMW 5 Series G30» (иконка `CircleX`, кнопка «В корзину» остаётся активной, но при нажатии — `AlertDialog` «Этот диск не подходит к выбранному авто. Всё равно добавить?»).
5. Нажимает «В корзину» → открывается `Sheet` корзины справа.
6. **Ошибка — товар снят с продажи (status ≠ active):** страница 404 «Товар больше не продаётся» + кнопка «В каталог».
7. **Ошибка — пока покупатель смотрел, последний комплект забронировали:** при нажатии «В корзину» запрос `POST /api/cart/validate` возвращает `available_qty = 0` → toast «Последний комплект только что забронирован. Проверьте через 30 минут» и бейдж меняется на «Нет в наличии».

**Критерии приёмки:**
- [ ] `available_qty` = `stock_qty` минус брони неоплаченных заказов, у которых `reserved_until > now()`.
- [ ] Для карбона всегда показывается срок `lead_time_min_days–lead_time_max_days` и текст «100% предоплата».
- [ ] Сертификации (`certifications`) выводятся, только если `claims_verified = true`.
- [ ] Цена показывается как «133 700 ₽ за комплект» (формат `Intl.NumberFormat('ru-RU')`, без копеек, если они равны 0).

### US-003: Заказ и оплата комплекта дисков

**Как** владелец Mercedes-AMG C63 W205, который решил купить комплект,
**я хочу** оформить заказ за 2–3 минуты и оплатить картой или через СБП,
**чтобы** заказ сразу ушёл в сборку на складе.

**Сценарий:**
1. В корзине (`/cart`) покупатель видит комплект, количество (`1`), итог «Доставка — бесплатно», нажимает «Оформить заказ».
2. На `/checkout` заполняет: имя, телефон, email, способ доставки (`RadioGroup`: «Курьер по Москве», «СДЭК — пункт выдачи», «СДЭК — до двери»), город, адрес / код ПВЗ, индекс, VIN (необязательно), комментарий.
3. Ставит обязательный `Checkbox` «Согласен на обработку персональных данных» (ссылка на `/privacy`) и «Принимаю условия оферты» (ссылка на `/offer`).
4. Нажимает «Перейти к оплате · 133 700 ₽». Кнопка показывает `Loader2` и блокируется.
5. Сервер (`POST /api/orders`) проверяет цены и наличие, создаёт заказ со статусом `pending_payment`, бронирует товар на 30 минут, создаёт платёж ЮKassa и возвращает `confirmation_url`.
6. Браузер переходит на платёжную страницу ЮKassa, покупатель платит картой или СБП.
7. ЮKassa возвращает покупателя на `/orders/FC-26-000123?t=<token>`. Webhook `payment.succeeded` переводит заказ в `paid`, списывает остаток, отправляет письмо покупателю и сообщение админу в Telegram.
8. **Ошибка — цена изменилась (пересчёт курса):** ответ `409 PRICE_CHANGED` → `AlertDialog` «Цена изменилась: было 133 700 ₽, стало 135 200 ₽. Продолжить?» с кнопками «Продолжить» (повторный запрос с новыми ценами) и «Вернуться в корзину».
9. **Ошибка — товар закончился:** `409 OUT_OF_STOCK` → toast «Комплект закончился» + позиция в корзине помечается «Нет в наличии», кнопка оплаты блокируется.
10. **Ошибка — покупатель закрыл страницу ЮKassa без оплаты:** заказ остаётся `pending_payment`, на странице заказа кнопка «Оплатить» (новый платёж через `POST /api/orders/[number]/pay`) до истечения брони; после — статус `cancelled` с причиной «Не оплачен за 30 минут».

**Критерии приёмки:**
- [ ] Заказ нельзя создать без двух согласий; в БД сохраняется `consent_pd_at` и `consent_policy_version`.
- [ ] Цены берутся только из БД, цена из клиента используется лишь для сравнения (`expected_total`).
- [ ] Повторный клик «Перейти к оплате» не создаёт второй заказ (клиентский `client_request_id` + уникальный индекс).
- [ ] Заказ переходит в `paid` только по webhook, подтверждённому повторным `GET /v3/payments/{id}`; возврат на `return_url` статус не меняет.
- [ ] Письмо покупателю уходит в течение 1 минуты после webhook.
- [ ] Чек ЮKassa формируется (объект `receipt` в платеже).

### US-004: Отслеживание заказа и доставка

**Как** покупатель из Казани, оплативший комплект,
**я хочу** видеть статус заказа и трек-номер СДЭК и получать уведомления,
**чтобы** знать, когда забирать диски, и не писать менеджеру.

**Сценарий:**
1. Покупатель открывает ссылку из письма `/orders/FC-26-000123?t=<token>`.
2. Видит номер заказа, состав, сумму, способ доставки, `OrderTimeline` из статусов: «Оплачен» → «Проверен инженером» → «Передан в доставку» → «Доставлен».
3. Нажимает «Получать статусы в Telegram» → открывается `https://t.me/forgecarbon_bot?start=o_<token>`; бот отвечает «Подписка на заказ FC-26-000123 оформлена».
4. Админ вводит трек-номер СДЭК и переводит заказ в `shipped` → покупатель получает письмо и сообщение в Telegram «Заказ FC-26-000123 передан в СДЭК. Трек: 1234567890. Отследить: https://www.cdek.ru/ru/tracking?order_id=1234567890».
5. Админ переводит заказ в `delivered` → письмо «Заказ доставлен».
6. **Ошибка — неверный или отсутствующий токен:** страница 404 «Заказ не найден» (без подсказки, существует ли номер).
7. **Ошибка — Telegram-подписка по устаревшему токену:** бот отвечает «Ссылка недействительна. Откройте страницу заказа из письма и нажмите кнопку ещё раз».

**Критерии приёмки:**
- [ ] Страница заказа не доступна по номеру без токена (кроме владельца-аккаунта и admin).
- [ ] Ссылка на трекинг формируется только для доставки СДЭК; для «Курьер по Москве» показывается телефон курьера из поля `courier_note`.
- [ ] Каждый переход статуса пишется в `order_status_history`.
- [ ] Ожидаемая дата доставки = дата отгрузки + `MOSCOW_DELIVERY_DAYS` или `REGION_DELIVERY_DAYS`.

### US-005: Заказ карбоновой детали под заказ

**Как** владелец BMW M4 G82, которому нужен карбоновый диффузор,
**я хочу** оплатить деталь полностью и видеть, где она сейчас,
**чтобы** понимать, когда она приедет из Китая.

**Сценарий:**
1. Покупатель открывает `/carbon?vehicle=<uuid M4 G82>`, видит детали, совместимые с его авто (таблица `product_vehicles`).
2. Открывает карточку «Диффузор задний карбон, BMW M4 G82/G83» — бейдж «Под заказ · 21–35 дней», текст «100% предоплата. Гарантия 12 месяцев».
3. Добавляет в корзину. Если в корзине уже лежат диски из наличия — `AlertDialog` «Детали под заказ оформляются отдельным заказом. Сначала оформите текущую корзину или замените её» с кнопками «Оформить текущую корзину» и «Заменить корзину».
4. Оформляет заказ так же, как в US-003. Ожидаемая дата на странице заказа: «Ожидаем 22 октября – 5 ноября 2026».
5. Админ меняет статусы: «Заказан у поставщика» → «Едет в Москву» → «Прибыл на склад» → «Передан в доставку» → «Доставлен». Каждый переход отправляет письмо и Telegram (если подписан).
6. **Ошибка — поставщик сообщил о задержке:** админ меняет `expected_ready_at` и пишет комментарий для покупателя → покупатель получает письмо «Срок поставки изменился: ожидаем 12 ноября 2026. Причина: задержка на таможне».
7. **Ошибка — поставщик не может поставить деталь:** админ делает полный возврат (US-010), заказ → `refunded`, покупатель получает письмо с суммой возврата.

**Критерии приёмки:**
- [ ] Заказ имеет `kind = 'preorder'`, ни при каких условиях не смешивается с `kind = 'stock'`.
- [ ] Для `preorder` остаток не проверяется и не списывается.
- [ ] `expected_ready_at` = `paid_at` + `lead_time_max_days` (максимум по позициям), считается при оплате.
- [ ] Покупатель видит только статусы из списка `preorder` (см. Блок 5, «Статусы заказа»).

### US-006: Админ добавляет товар в каталог

**Как** владелец магазина, получивший партию из 4 комплектов кованых дисков,
**я хочу** завести товар с характеристиками, фото, закупочной ценой в долларах и остатком,
**чтобы** он появился в подборе с правильной ценой.

**Сценарий:**
1. Админ открывает `/admin/products/new`.
2. Выбирает тип «Комплект дисков». Форма показывает поля дисков (диаметр, ширина перед/зад, вылет перед/зад, PCD, ЦО, посадка крепежа, кольца в комплекте, крепёж в комплекте, конструкция, вес, покрытие).
3. Вводит закупку `800.00` USD за комплект, режим цены «Авто по курсу ЦБ». Форма сразу показывает расчёт «800 × 83,5600 × 2 = 133 696 ₽ → 133 700 ₽».
4. Вводит остаток `4`, гарантию `24` мес., описание, slug генерируется из названия (можно поправить).
5. Загружает до 8 фото (JPG/PNG/WebP, до 5 МБ каждое) — перетаскиванием, порядок меняется перетаскиванием.
6. Нажимает «Опубликовать» (status `active`) или «Сохранить черновик» (`draft`).
7. **Ошибка — slug уже занят:** inline под полем «Такой адрес уже используется: forged-m01-r20-5x112-gunmetal» и кнопка «Сгенерировать другой».
8. **Ошибка — нет курса ЦБ (cron не отработал):** расчёт показывает «Курс USD не загружен» и кнопку «Загрузить курс сейчас» (`POST /api/admin/exchange-rates/refresh`); публикация в режиме «Авто» заблокирована до загрузки курса.

**Критерии приёмки:**
- [ ] Цена в режиме `auto` = `ceil(purchase_cost / 100 × rate × markup_multiplier / 100) × 100` ₽, хранится в копейках.
- [ ] Товар без фото нельзя опубликовать (`VALIDATION_ERROR` «Добавьте хотя бы одно фото»).
- [ ] Поле «Сертификации» выводится в магазине только при включённом чекбоксе «Заявления подтверждены поставщиком и производителем».
- [ ] Закупочная цена никогда не попадает в публичные API-ответы.

### US-007: Админ ведёт заказ до доставки и вводит трек

**Как** консультант-инженер магазина,
**я хочу** проверить совместимость дисков с автомобилем клиента, упаковать и отправить заказ с трек-номером,
**чтобы** клиент получил правильный комплект за срок до 5 дней.

**Сценарий:**
1. Приходит сообщение в Telegram «💳 Оплачен заказ FC-26-000123 · 133 700 ₽ · BMW 5 Series G30 · Казань, СДЭК ПВЗ KZN45». Ссылка ведёт в `/admin/orders/<id>`.
2. Админ видит данные клиента, VIN, автомобиль, позиции, кнопку «Проверен инженером» → статус `confirmed`.
3. Если сомневается в совместимости — звонит клиенту по телефону из заказа.
4. Создаёт отправление в личном кабинете СДЭК вручную, вводит трек-номер в поле «Трек-номер» и нажимает «Передан в доставку» → статус `shipped`.
5. Через 2–5 дней нажимает «Доставлен» → `delivered`.
6. **Ошибка — недопустимый переход (например, `paid` → `delivered`):** кнопки недопустимых статусов не показываются; при прямом вызове API — `409 INVALID_STATUS_TRANSITION`.
7. **Ошибка — `shipped` без трек-номера для СДЭК:** inline «Укажите трек-номер СДЭК» (для курьера по Москве обязательна заметка `courier_note`).

**Критерии приёмки:**
- [ ] Переходы статусов строго по таблице из Блока 5.
- [ ] Список заказов фильтруется по статусу, сортируется по дате (новые сверху), пагинация по 20.
- [ ] Заказы с флагом `needs_attention = true` подсвечены в списке иконкой `TriangleAlert`.

### US-008: Админ делает возврат

**Как** владелец магазина, клиент которого передумал до отправки,
**я хочу** вернуть деньги из админки одной кнопкой,
**чтобы** не заходить в личный кабинет ЮKassa и не ошибиться с суммой.

**Сценарий:**
1. Админ на `/admin/orders/<id>` нажимает «Оформить возврат».
2. `Dialog`: сумма (по умолчанию — вся оплаченная сумма), причина (обязательно, 5–500 символов), чекбокс «Вернуть товар на склад» (по умолчанию включён для `kind = 'stock'`).
3. Нажимает «Вернуть 133 700 ₽» → `POST /api/admin/orders/<id>/refund` → ЮKassa `POST /v3/refunds`.
4. При `succeeded` — статус заказа `refunded` (если сумма полная) или остаётся текущим с записью частичного возврата; остаток возвращается на склад; покупателю письмо.
5. **Ошибка — ЮKassa вернула ошибку:** toast «ЮKassa отклонила возврат: <description из ответа>», запись `refunds.status = 'failed'`, статус заказа не меняется.
6. **Ошибка — сумма больше оставшейся к возврату:** inline «Максимум к возврату: 133 700 ₽».

**Критерии приёмки:**
- [ ] Сумма всех возвратов по заказу ≤ сумма успешного платежа.
- [ ] Повторное нажатие не создаёт второй возврат (Idempotence-Key = `refund_<refund.id>`).

### US-009: Регистрация тюнинг-ателье

**Как** руководитель тюнинг-ателье в Санкт-Петербурге,
**я хочу** зарегистрироваться и подать заявку как ателье,
**чтобы** видеть свои цены и заказывать для клиентов.

**Сценарий:**
1. Открывает `/atelier`, читает условия, нажимает «Подать заявку».
2. Не залогинен → `/auth/register?next=/atelier`. Вводит имя, email, пароль (8–72 символа, минимум 1 буква и 1 цифра).
3. Подтверждает email по ссылке из письма → `/auth/callback` → возврат на `/atelier`.
4. Заполняет форму: название ателье, ИНН (10 или 12 цифр), город, контактное лицо, телефон, сайт или Instagram/VK (необязательно), комментарий.
5. Нажимает «Отправить заявку» → статус «На рассмотрении»; админу приходит Telegram «🏁 Новая заявка ателье: Garage 77, ИНН 7801234567, Санкт-Петербург».
6. Админ одобряет → `profiles.role = 'atelier'`, письмо «Заявка одобрена. Цены для ателье доступны после входа».
7. **Ошибка — ИНН не прошёл проверку контрольной суммы:** inline «Проверьте ИНН — контрольная сумма не совпадает».
8. **Ошибка — заявка уже подана:** форма заменяется статусом «Заявка на рассмотрении с 01.10.2026».

**Критерии приёмки:**
- [ ] Одна заявка на аккаунт (уникальный `ateliers.user_id`).
- [ ] При отклонении показывается причина и кнопка «Подать повторно» (статус → `pending`).
- [ ] Пока функция выключена `FEATURE_ATELIER = false`, маршрут `/atelier` отдаёт 404.

### US-010: Оптовые цены для ателье

**Как** одобренное ателье,
**я хочу** видеть свою цену рядом с розничной и платить по ней,
**чтобы** заказывать для клиентов выгоднее, чем в рознице.

**Сценарий:**
1. Ателье входит в аккаунт и открывает каталог.
2. На карточках, где у товара заполнена `price_atelier`, видит «Для ателье: 118 000 ₽» крупно и «Розница: 133 700 ₽» мелким зачёркнутым шрифтом.
3. Если `price_atelier` пустая — видит только розничную цену.
4. Оформляет заказ так же, как в US-003; сервер подставляет `price_atelier`. Заказ связывается с `user_id` и `atelier_id`.
5. Видит свои заказы в `/account`.
6. **Ошибка — сессия истекла во время оформления:** `POST /api/orders` считает покупателя гостем → `409 PRICE_CHANGED` с розничными ценами → `AlertDialog` «Сессия истекла, показаны розничные цены. Войдите снова, чтобы получить цены ателье» с кнопкой «Войти».

**Критерии приёмки:**
- [ ] `price_atelier` не попадает в ответы для guest/customer.
- [ ] Ателье с `status ≠ 'approved'` видит розничные цены.
- [ ] Оплата ателье — та же 100% предоплата картой/СБП (счёт для юрлица — вне MVP).

### US-011: Восстановление пароля (ателье, админ)

**Как** ателье, забывшее пароль,
**я хочу** получить ссылку на сброс,
**чтобы** войти и не потерять историю заказов.

**Сценарий:**
1. На `/auth/login` нажимает «Забыли пароль?» → `/auth/forgot-password`.
2. Вводит email → `supabase.auth.resetPasswordForEmail(email, { redirectTo: NEXT_PUBLIC_SITE_URL + '/auth/callback?next=/auth/update-password' })`.
3. Видит «Если аккаунт с таким email есть, письмо отправлено» (одинаковый ответ для существующих и несуществующих email).
4. Переходит по ссылке → `/auth/update-password`, вводит новый пароль дважды.
5. `supabase.auth.updateUser({ password })` → redirect на `/account`.
6. **Ошибка — ссылка устарела:** «Ссылка устарела. Запросите новую» + кнопка на `/auth/forgot-password`.

**Критерии приёмки:**
- [ ] Ответ не раскрывает, зарегистрирован ли email.
- [ ] Не чаще 1 письма в 60 секунд на email (лимит Supabase Auth).

---
## БЛОК 2: Data Model

### Принципы

- Весь SQL ниже выполняется **одним файлом** `supabase/migrations/0001_init.sql` в Supabase SQL Editor в том порядке, в каком он написан.
- Все `id` — `uuid default gen_random_uuid()`.
- Все деньги в рублях — `integer` в **копейках** (`133 700 ₽` = `13370000`). Закупочная цена — `integer` в минимальных единицах валюты закупки (центы для USD, фэни для CNY, копейки для RUB).
- Все таблицы имеют `created_at` и `updated_at` (кроме журналов, где запись неизменна: `order_status_history`, `exchange_rates`, `rate_limit_hits`), `updated_at` обновляет триггер `moddatetime`.
- Каталог (`products`, `product_images`, `product_vehicles`) читается публично **только через сервер** (service-role клиент с явным списком колонок), потому что в `products` лежат `purchase_cost` и `price_atelier`, а RLS не умеет скрывать отдельные колонки. RLS на этих таблицах разрешает чтение только admin — это защита на случай утечки anon-ключа.
- Отсутствие политики для операции = операция запрещена для `anon` и `authenticated`. Service-role клиент обходит RLS и используется только в Route Handlers.

### Диаграмма связей

```
auth.users 1──1 profiles (id)                         ON DELETE CASCADE
auth.users 1──1 ateliers (user_id)                    ON DELETE CASCADE
auth.users 1──N orders (user_id, nullable)            ON DELETE SET NULL
ateliers   1──N orders (atelier_id, nullable)         ON DELETE SET NULL
vehicles   1──N orders (vehicle_id, nullable)         ON DELETE SET NULL
products   1──N product_images (product_id)           ON DELETE CASCADE
products   N──M vehicles через product_vehicles       ON DELETE CASCADE (обе стороны)
products   1──N order_items (product_id, nullable)    ON DELETE SET NULL (в позиции есть снапшот названия и цены)
orders     1──N order_items (order_id)                ON DELETE RESTRICT (заказы не удаляются)
orders     1──N payments (order_id)                   ON DELETE RESTRICT
orders     1──N refunds (order_id)                    ON DELETE RESTRICT
payments   1──N refunds (payment_id)                  ON DELETE RESTRICT
orders     1──N order_status_history (order_id)       ON DELETE RESTRICT
auth.users 1──N order_status_history (changed_by)     ON DELETE SET NULL
exchange_rates, app_settings, notification_queue, rate_limit_hits — без связей
```

### 2.0 Расширения, общие функции, последовательности

```sql
-- moddatetime: автообновление updated_at
create extension if not exists moddatetime with schema extensions;

-- Номер заказа: FC-26-000001
create sequence if not exists public.order_number_seq start 1;

-- Тело SQL-функции проверяется при создании, а public.profiles появится только в 2.1:
-- на время создания этих двух функций проверку тел отключаем.
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

reset check_function_bodies;
```

### 2.1 profiles

```sql
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
```

### 2.2 ateliers

```sql
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
```

### 2.3 vehicles

```sql
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
```

### 2.4 products

```sql
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
```

### 2.5 product_images

```sql
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
```

### 2.6 product_vehicles

```sql
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
```

### 2.7 orders

```sql
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
```

### 2.8 order_items

```sql
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
```

### 2.9 payments

```sql
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
```

### 2.10 refunds

```sql
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
```

### 2.11 order_status_history

```sql
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
```

### 2.12 exchange_rates, app_settings

```sql
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
```

### 2.13 notification_queue, rate_limit_hits

```sql
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

revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
```

### 2.14 Функции бизнес-логики

```sql
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

-- Каталог и остатки читает только сервер (service-role); через /rest/v1/rpc anon
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

-- Только сервер, см. reserved_qty.
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

-- Только сервер, см. reserved_qty.
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
  -- Один товар — одна строка. Иначе [{p,1},{p,1}] обходит проверку остатка
  -- (обе строки видят одинаковый резерв) и QTY_LIMIT (2+2). Сравнение по uuid, не по тексту.
  if (select count(distinct (e->>'product_id')::uuid) from jsonb_array_elements(p_items) e)
     <> jsonb_array_length(p_items) then
    raise exception 'DUPLICATE_ITEMS' using errcode = 'P0001';
  end if;

  -- Первый проход: блокировка строк товаров, проверки, сумма.
  -- Блокируем строки в едином порядке (по product_id), чтобы два
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

revoke execute on function public.restock_order(uuid) from public, anon, authenticated;
grant execute on function public.restock_order(uuid) to service_role;
```

### 2.15 Storage

```sql
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

-- Storage API (remove, upsert, list) находит объекты через SELECT —
-- без этой политики замена и удаление фото в админке падают. Нужна только admin:
-- публичный бакет отдаёт файлы по URL без проверки политик
-- https://<project-ref>.supabase.co/storage/v1/object/public/product-images/<path>
create policy "product_images_bucket_select_admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
```

### 2.16 Seed (`supabase/seed.sql`)

Справочник автомобилей на старт. Перед запуском инженер сверяет каждую строку с каталогом производителя; изменение строки не требует изменений кода.

```sql
insert into public.vehicles
  (make, model, generation, year_from, year_to, pcd, center_bore_mm, seat_type, fastener_spec,
   diameter_min_in, diameter_max_in, width_min_in, width_max_in, et_min_mm, et_max_mm)
values
  ('Audi', 'A4', 'B9', 2016, 2024, '5x112', 66.5, 'ball_r13', 'Болт M14×1.5', 17, 20, 7.5, 9.0, 25, 45),
  ('Audi', 'A6', 'C8', 2018, null, '5x112', 66.5, 'ball_r13', 'Болт M14×1.5', 18, 22, 8.0, 10.0, 20, 45),
  ('Audi', 'RS6', 'C8', 2019, null, '5x112', 66.5, 'ball_r13', 'Болт M14×1.5', 21, 23, 9.5, 11.0, 15, 35),
  ('Audi', 'Q7', '4M', 2015, null, '5x112', 66.5, 'ball_r13', 'Болт M14×1.5', 19, 22, 8.5, 10.5, 20, 40),
  ('BMW', '3 Series', 'F30', 2012, 2019, '5x120', 72.6, 'cone60', 'Болт M14×1.25', 17, 20, 7.5, 9.5, 20, 45),
  ('BMW', '3 Series', 'G20', 2019, null, '5x112', 66.6, 'cone60', 'Болт M14×1.25', 18, 20, 7.5, 9.5, 20, 40),
  ('BMW', '5 Series', 'F10', 2010, 2017, '5x120', 72.6, 'cone60', 'Болт M14×1.25', 17, 20, 8.0, 10.0, 15, 40),
  ('BMW', '5 Series', 'G30', 2017, 2023, '5x112', 66.6, 'cone60', 'Болт M14×1.25', 18, 21, 8.0, 10.0, 20, 40),
  ('BMW', 'M4', 'G82', 2021, null, '5x112', 66.6, 'cone60', 'Болт M14×1.25', 19, 21, 9.0, 11.0, 15, 40),
  ('BMW', 'X5', 'G05', 2018, 2023, '5x112', 66.6, 'cone60', 'Болт M14×1.25', 19, 22, 9.0, 11.5, 20, 45),
  ('Mercedes-Benz', 'C-Class', 'W205', 2014, 2021, '5x112', 66.6, 'ball_r14', 'Болт M14×1.5', 17, 20, 7.5, 9.5, 25, 50),
  ('Mercedes-Benz', 'E-Class', 'W213', 2016, 2023, '5x112', 66.6, 'ball_r14', 'Болт M14×1.5', 18, 21, 8.0, 10.0, 25, 50),
  ('Mercedes-Benz', 'GLE', 'W167', 2019, null, '5x112', 66.6, 'ball_r14', 'Болт M14×1.5', 19, 22, 9.0, 10.5, 25, 50);
```

### 2.17 Создание первого админа

После регистрации владельца через `/auth/register` выполнить в SQL Editor (email владельца подставляется в запрос вручную один раз):

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'owner@forgecarbon.ru');
```

---
## БЛОК 3: API Endpoints

### 3.0 Общие правила

- Все эндпоинты — Route Handlers Next.js 16: файл `src/app/api/<path>/route.ts`, экспорт функций `GET`, `POST`, `PATCH`, `PUT`, `DELETE`. Динамические параметры: `{ params }: { params: Promise<{ id: string }> }`, читать через `const { id } = await params;`.
- Все ответы — `application/json; charset=utf-8`. Деньги — целые копейки + отформатированная строка `*_formatted` для отображения.
- Формат успеха: `{ "data": ... }`, списки: `{ "data": [...], "meta": { "total": 57, "page": 1, "per_page": 24 } }`.
- Формат ошибки: `{ "error": { "code": "ERROR_CODE", "message": "Текст для пользователя на русском", "details": {...} } }` (`details` — необязательное поле).
- Валидация: каждый вход парсится Zod-схемой (`safeParse`); при ошибке — `400 VALIDATION_ERROR`, `details.fields` = `z.flattenError(err).fieldErrors`.
- Неожиданное исключение — `500 INTERNAL_ERROR`, в лог `console.error` пишется стек, клиенту стек не отдаётся.

`src/lib/api-error.ts`:

```ts
import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "VALIDATION_ERROR" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "RATE_LIMITED"
  | "OUT_OF_STOCK" | "PRICE_CHANGED" | "MIXED_KINDS" | "QTY_LIMIT" | "PRODUCT_UNAVAILABLE"
  | "INVALID_STATUS_TRANSITION" | "PAYMENT_PROVIDER_ERROR" | "ORDER_NOT_PAYABLE"
  | "REFUND_EXCEEDS_PAID" | "SLUG_TAKEN" | "SKU_TAKEN" | "IMAGES_LIMIT" | "RATE_NOT_LOADED"
  | "ALREADY_APPLIED" | "FEATURE_DISABLED" | "CONFLICT" | "INTERNAL_ERROR";

export function apiError(code: ApiErrorCode, message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}
```

`src/lib/auth.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export async function getSessionContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null, atelierId: null } as const;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  let atelierId: string | null = null;
  if (profile?.role === "atelier") {
    const { data: a } = await supabase.from("ateliers").select("id,status").eq("user_id", user.id).single();
    atelierId = a?.status === "approved" ? a.id : null;
  }
  return { supabase, user, role: profile?.role ?? "customer", atelierId } as const;
}

// В начале каждого /api/admin/*:
// const ctx = await getSessionContext();
// if (!ctx.user) return apiError("UNAUTHORIZED", "Войдите в аккаунт", 401);
// if (ctx.role !== "admin") return apiError("FORBIDDEN", "Недостаточно прав", 403);
```

Стандартные ошибки, общие для всех эндпоинтов (в разделах эндпоинтов указаны дополнительно только специфичные):

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Войдите в аккаунт" } }
{ "error": { "code": "FORBIDDEN", "message": "Недостаточно прав" } }
{ "error": { "code": "RATE_LIMITED", "message": "Слишком много запросов. Повторите через минуту", "details": { "retry_after_seconds": 60 } } }
{ "error": { "code": "INTERNAL_ERROR", "message": "Что-то пошло не так. Мы уже разбираемся" } }
```

Общие Zod-примитивы `src/lib/schemas/common.ts`:

```ts
import { z } from "zod";

export const uuid = z.uuid();
export const page = z.coerce.number().int().min(1).max(1000).default(1);
export const phoneRu = z.string().trim()
  .transform((v) => v.replace(/[\s()-]/g, "").replace(/^8(\d{10})$/, "+7$1").replace(/^7(\d{10})$/, "+7$1"))
  .pipe(z.string().regex(/^\+7\d{10}$/, "Телефон в формате +7 999 123-45-67"));
export const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Проверьте email"));
export const make = z.enum(["Audi", "BMW", "Mercedes-Benz"]);
export const kopecks = z.number().int().positive().max(100_000_000_00);
```

---

### Группа: Подбор по авто (публичные)

#### `GET /api/vehicles/makes`

**Описание:** список марок, по которым есть активные автомобили.
**Авторизация:** публичный. Кэш: `export const revalidate = 3600`.
**Параметры:** нет.

**Ответ 200:**
```json
{ "data": ["Audi", "BMW", "Mercedes-Benz"] }
```

**Ответ 500:**
```json
{ "error": { "code": "INTERNAL_ERROR", "message": "Что-то пошло не так. Мы уже разбираемся" } }
```

#### `GET /api/vehicles/models?make=BMW`

**Описание:** модели марки.
**Авторизация:** публичный. Кэш 3600 с.

**Zod:**
```ts
export const vehicleModelsQuery = z.object({ make });
```

**Ответ 200:**
```json
{ "data": ["3 Series", "5 Series", "M4", "X5"] }
```

**Ответ 400:**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Неизвестная марка", "details": { "fields": { "make": ["Invalid option: expected one of \"Audi\"|\"BMW\"|\"Mercedes-Benz\""] } } } }
```

#### `GET /api/vehicles/years?make=BMW&model=5%20Series`

**Описание:** годы выпуска, покрытые записями модели (от минимального `year_from` до максимального `coalesce(year_to, текущий год)`), по убыванию.
**Авторизация:** публичный. Кэш 3600 с.

**Zod:**
```ts
export const vehicleYearsQuery = z.object({ make, model: z.string().trim().min(1).max(60) });
```

**Ответ 200:**
```json
{ "data": [2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010] }
```

**Ответ 404:**
```json
{ "error": { "code": "NOT_FOUND", "message": "Модель не найдена" } }
```

#### `GET /api/vehicles/resolve?make=BMW&model=5%20Series&year=2017`

**Описание:** поколения, которые выпускались в указанный год. Если элемент один — клиент сразу использует его `id`; если несколько — показывает выбор поколения.
**Авторизация:** публичный.

**Zod:**
```ts
export const vehicleResolveQuery = z.object({
  make,
  model: z.string().trim().min(1).max(60),
  year: z.coerce.number().int().min(1990).max(2100),
});
```

**Ответ 200:**
```json
{
  "data": [
    { "id": "1b7e3c90-4d2a-4f61-8a35-0c9e7d2f5a18", "make": "BMW", "model": "5 Series", "generation": "F10", "year_from": 2010, "year_to": 2017, "label": "BMW 5 Series F10 · 2010–2017" },
    { "id": "6f2d8a41-9c3e-4b75-a0d2-3e8f1c7b9d64", "make": "BMW", "model": "5 Series", "generation": "G30", "year_from": 2017, "year_to": 2023, "label": "BMW 5 Series G30 · 2017–2023" }
  ]
}
```

**Ответ 404:**
```json
{ "error": { "code": "NOT_FOUND", "message": "Для BMW 5 Series 1995 года данных нет" } }
```

#### `GET /api/vehicles/[id]`

**Описание:** параметры автомобиля (для бейджа в шапке и блока «Подходит/не подходит»).
**Авторизация:** публичный.

**Zod:** `z.object({ id: uuid })`

**Ответ 200:**
```json
{
  "data": {
    "id": "6f2d8a41-9c3e-4b75-a0d2-3e8f1c7b9d64",
    "make": "BMW", "model": "5 Series", "generation": "G30", "year_from": 2017, "year_to": 2023,
    "label": "BMW 5 Series G30 · 2017–2023",
    "pcd": "5x112", "center_bore_mm": 66.6, "seat_type": "cone60", "fastener_spec": "Болт M14×1.25",
    "diameter_min_in": 18, "diameter_max_in": 21, "width_min_in": 8.0, "width_max_in": 10.0, "et_min_mm": 20, "et_max_mm": 40
  }
}
```

**Ответ 404:**
```json
{ "error": { "code": "NOT_FOUND", "message": "Автомобиль не найден" } }
```

---

### Группа: Каталог (публичные)

Публичные колонки товара — константа в `src/lib/catalog.ts`:

```ts
export const PUBLIC_PRODUCT_COLUMNS =
  "id,type,slug,sku,title,manufacturer,description,status,availability_mode,stock_qty," +
  "lead_time_min_days,lead_time_max_days,price,price_atelier,diameter_in,width_front_in,width_rear_in," +
  "et_front_mm,et_rear_mm,pcd,center_bore_mm,seat_type,includes_hub_rings,includes_fasteners," +
  "construction,finish,weight_kg,warranty_months,certifications,claims_verified,created_at";
// purchase_cost, purchase_currency, pricing_mode НЕ входят в список никогда.
// price_atelier удаляется из ответа функцией toPublicProduct(), если ctx.atelierId === null.
// certifications заменяются на [], если claims_verified === false.
```

#### `GET /api/products`

**Описание:** список товаров каталога с фильтрами.
**Авторизация:** публичный (если сессия ателье одобрена — в ответе `price_atelier`).

**Параметры запроса:**

| Параметр | Тип | Обяз. | Значения |
|----------|-----|-------|----------|
| `type` | enum | да | `wheel_set` \| `carbon_part` |
| `vehicle` | uuid | нет | id автомобиля; для `wheel_set` — через `find_wheels_for_vehicle`, для `carbon_part` — через `product_vehicles` |
| `diameter` | int | нет | 17–23, только для `wheel_set` |
| `construction` | enum | нет | `cast` \| `flow_formed` \| `forged` (forged = все `forged_*`) |
| `availability` | enum | нет | `in_stock` (только `available_qty > 0`) \| `all` (по умолчанию) |
| `sort` | enum | нет | `price_asc` \| `price_desc` \| `newest` (по умолчанию `newest`) |
| `page` | int | нет | ≥ 1, по 24 на страницу |

**Zod:**
```ts
export const productsQuery = z.object({
  type: z.enum(["wheel_set", "carbon_part"]),
  vehicle: uuid.optional(),
  diameter: z.coerce.number().int().min(15).max(24).optional(),
  construction: z.enum(["cast", "flow_formed", "forged"]).optional(),
  availability: z.enum(["in_stock", "all"]).default("all"),
  sort: z.enum(["price_asc", "price_desc", "newest"]).default("newest"),
  page,
});
```

**Ответ 200:**
```json
{
  "data": [
    {
      "id": "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51",
      "type": "wheel_set",
      "slug": "forged-m01-r20-5x112-graphite",
      "title": "Кованый моноблок M-01 R20, 5×112, графит",
      "manufacturer": "ForgeCarbon Forged",
      "price": 13370000,
      "price_formatted": "133 700 ₽",
      "price_atelier": null,
      "price_atelier_formatted": null,
      "availability": {
        "mode": "stock",
        "available_qty": 3,
        "status": "in_stock",
        "label": "В наличии в Москве",
        "delivery_text": "Москва — 1–2 дня, регионы — 2–5 рабочих дней"
      },
      "specs_short": "R20 · 8.5J/9.5J · 5×112 · ET 30/40 · ЦО 66.6",
      "fitment": { "vehicle_id": "6f2d8a41-9c3e-4b75-a0d2-3e8f1c7b9d64", "fits": true, "needs_hub_rings": false },
      "cover_image": {
        "url": "https://abcdefghijklmnop.supabase.co/storage/v1/object/public/product-images/products/8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51/2b9c1d7e-0a4f-4c3e-8d21-7f5e6a9b0c13.webp",
        "alt": "Кованый диск M-01 графит, вид спереди"
      }
    },
    {
      "id": "d4a7b2c9-1e3f-4a8b-9c6d-2f0e5b8a7c31",
      "type": "wheel_set",
      "slug": "cast-r19-5x112-silver",
      "title": "Литой диск C-07 R19, 5×112, серебро",
      "manufacturer": "ForgeCarbon Cast",
      "price": 5240000,
      "price_formatted": "52 400 ₽",
      "price_atelier": null,
      "price_atelier_formatted": null,
      "availability": {
        "mode": "stock",
        "available_qty": 0,
        "status": "out_of_stock",
        "label": "Нет в наличии",
        "delivery_text": null
      },
      "specs_short": "R19 · 8.5J · 5×112 · ET 35 · ЦО 66.6",
      "fitment": { "vehicle_id": "6f2d8a41-9c3e-4b75-a0d2-3e8f1c7b9d64", "fits": true, "needs_hub_rings": false },
      "cover_image": {
        "url": "https://abcdefghijklmnop.supabase.co/storage/v1/object/public/product-images/products/d4a7b2c9-1e3f-4a8b-9c6d-2f0e5b8a7c31/5e1a9c3b-7d2f-4b8e-a6c0-9d3f1e7b2a54.webp",
        "alt": "Литой диск C-07 серебро"
      }
    }
  ],
  "meta": { "total": 14, "page": 1, "per_page": 24, "vehicle_label": "BMW 5 Series G30 · 2017–2023" }
}
```

Порядок: товары с `availability.status = "in_stock"` всегда выше `out_of_stock` при любой сортировке; внутри групп — по `sort`. `fitment` = `null`, если `vehicle` не передан.

**Ответ 400:**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Неверные параметры фильтра", "details": { "fields": { "type": ["Invalid option: expected one of \"wheel_set\"|\"carbon_part\""] } } } }
```

**Ответ 404 (vehicle не найден или неактивен):**
```json
{ "error": { "code": "NOT_FOUND", "message": "Автомобиль не найден, показаны все товары" } }
```
Клиент при этом коде повторяет запрос без `vehicle` и показывает toast с этим сообщением.

#### `GET /api/products/[slug]`

**Описание:** карточка товара. Необязательный `?vehicle=<uuid>` добавляет блок совместимости.
**Авторизация:** публичный. Товары `draft` и `archived` → 404 (для admin — 200 с `status`).

**Zod:**
```ts
export const productSlugParams = z.object({ slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120) });
export const productDetailQuery = z.object({ vehicle: uuid.optional() });
```

**Ответ 200 (комплект дисков):**
```json
{
  "data": {
    "id": "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51",
    "type": "wheel_set",
    "slug": "forged-m01-r20-5x112-graphite",
    "sku": "FCF-M01-2085-GR",
    "title": "Кованый моноблок M-01 R20, 5×112, графит",
    "manufacturer": "ForgeCarbon Forged",
    "description": "Кованый моноблок из алюминиевого сплава 6061-T6. Комплект из 4 дисков: передние 8.5J ET30, задние 9.5J ET40. Покрытие — графит, сатин.",
    "price": 13370000,
    "price_formatted": "133 700 ₽",
    "price_atelier": null,
    "price_atelier_formatted": null,
    "sold_as": "Комплект из 4 дисков",
    "availability": { "mode": "stock", "available_qty": 3, "status": "in_stock", "label": "В наличии в Москве", "delivery_text": "Москва — 1–2 дня, регионы — 2–5 рабочих дней", "lead_time": null },
    "specs": {
      "diameter_in": 20, "width_front_in": 8.5, "width_rear_in": 9.5, "et_front_mm": 30, "et_rear_mm": 40,
      "pcd": "5x112", "center_bore_mm": 66.6, "seat_type": "cone60", "seat_type_label": "Конус 60°",
      "construction": "forged_monoblock", "construction_label": "Кованый моноблок",
      "finish": "Графит, сатин", "weight_kg": 9.8, "includes_hub_rings": false, "includes_fasteners": false
    },
    "warranty_months": 24,
    "certifications": [],
    "images": [
      { "url": "https://abcdefghijklmnop.supabase.co/storage/v1/object/public/product-images/products/8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51/2b9c1d7e-0a4f-4c3e-8d21-7f5e6a9b0c13.webp", "alt": "Кованый диск M-01 графит, вид спереди", "sort_order": 0 },
      { "url": "https://abcdefghijklmnop.supabase.co/storage/v1/object/public/product-images/products/8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51/9f4e2d1c-3b7a-4e6f-b0a8-5c2d7e1f3a96.webp", "alt": "Макро спиц M-01", "sort_order": 1 }
    ],
    "fitment": {
      "vehicle_id": "6f2d8a41-9c3e-4b75-a0d2-3e8f1c7b9d64",
      "vehicle_label": "BMW 5 Series G30 · 2017–2023",
      "fits": true,
      "needs_hub_rings": false,
      "fastener_note": "Используйте штатные болты BMW M14×1.25 (конус 60°)"
    },
    "compatible_vehicles": null
  }
}
```

**Ответ 200 (карбон) — отличающиеся поля:**
```json
{
  "data": {
    "id": "a3e9c1b7-2d4f-4e8a-b6c0-1f7d9e3a5b28",
    "type": "carbon_part",
    "slug": "bmw-m4-g82-carbon-rear-diffuser",
    "sku": "FCC-G82-DIF-01",
    "title": "Задний диффузор, карбон, BMW M4 G82/G83",
    "manufacturer": "ForgeCarbon Carbon",
    "description": "Диффузор из препрега, лак с УФ-защитой, крепление в штатные точки.",
    "price": 9860000,
    "price_formatted": "98 600 ₽",
    "price_atelier": null,
    "price_atelier_formatted": null,
    "sold_as": "1 шт.",
    "availability": { "mode": "preorder", "available_qty": null, "status": "preorder", "label": "Под заказ", "delivery_text": "Срок поставки 21–35 дней · 100% предоплата", "lead_time": { "min_days": 21, "max_days": 35 } },
    "specs": null,
    "warranty_months": 12,
    "certifications": [],
    "images": [
      { "url": "https://abcdefghijklmnop.supabase.co/storage/v1/object/public/product-images/products/a3e9c1b7-2d4f-4e8a-b6c0-1f7d9e3a5b28/4c8e1a2b-6d9f-4e3a-8b5c-0f2e7d1a9c63.webp", "alt": "Карбоновый диффузор BMW M4 G82", "sort_order": 0 }
    ],
    "fitment": { "vehicle_id": "c8b2e5d1-7f3a-4c9e-a1d6-4b0e8f2c7a95", "vehicle_label": "BMW M4 G82 · 2021–н.в.", "fits": true, "needs_hub_rings": false, "fastener_note": null },
    "compatible_vehicles": ["BMW M4 G82 · 2021–н.в."]
  }
}
```

**Ответ 404:**
```json
{ "error": { "code": "NOT_FOUND", "message": "Товар больше не продаётся" } }
```

---

### Группа: Корзина и заказ (публичные)

Корзина хранится на клиенте в `localStorage` под ключом `fc_cart_v1`:

```json
{ "kind": "stock", "items": [{ "product_id": "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", "quantity": 1, "price_seen": 13370000 }], "updated_at": "2026-10-01T12:30:00.000Z" }
```

#### `POST /api/cart/validate`

**Описание:** сверка корзины с БД: актуальные цены, наличие, лимиты. Вызывается при открытии `/cart`, `/checkout` и при «В корзину».
**Авторизация:** публичный (цены ателье — если сессия ателье). Rate limit: 60 запросов / 60 с на IP.

**Запрос:**
```json
{ "items": [
  { "product_id": "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", "quantity": 1 }
] }
```

**Zod:**
```ts
export const cartValidateBody = z.object({
  items: z.array(z.object({ product_id: uuid, quantity: z.number().int().min(1).max(4) })).min(1).max(10)
    .refine((a) => new Set(a.map((i) => i.product_id)).size === a.length, "Один товар — одна позиция"),
});
```

**Ответ 200:**
```json
{
  "data": {
    "kind": "stock",
    "items": [
      {
        "product_id": "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51",
        "slug": "forged-m01-r20-5x112-graphite",
        "title": "Кованый моноблок M-01 R20, 5×112, графит",
        "cover_image_url": "https://abcdefghijklmnop.supabase.co/storage/v1/object/public/product-images/products/8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51/2b9c1d7e-0a4f-4c3e-8d21-7f5e6a9b0c13.webp",
        "quantity": 1,
        "max_quantity": 2,
        "unit_price": 13370000,
        "unit_price_formatted": "133 700 ₽",
        "line_total": 13370000,
        "line_total_formatted": "133 700 ₽",
        "available": true,
        "available_qty": 3,
        "problem": null
      }
    ],
    "subtotal": 13370000,
    "subtotal_formatted": "133 700 ₽",
    "delivery_price": 0,
    "total": 13370000,
    "total_formatted": "133 700 ₽",
    "can_checkout": true,
    "price_tier": "retail"
  }
}
```

`problem` принимает значения: `null`, `"out_of_stock"` (нет остатка), `"qty_reduced"` (остатка меньше, `quantity` уменьшено до `available_qty`), `"unavailable"` (товар снят), `"mixed_kind"` (позиция другого типа, чем первая). При любом `problem ≠ null` → `can_checkout: false`, кроме `qty_reduced`.

**Ответ 400:**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Корзина пуста", "details": { "fields": { "items": ["Too small: expected array to have >=1 items"] } } } }
```

#### `POST /api/orders`

**Описание:** создание заказа, бронь на 30 минут, создание платежа ЮKassa. Возвращает URL платёжной страницы.
**Авторизация:** публичный (если сессия — заказ привязывается к `user_id`; если ателье одобрено — `atelier_id` и цены ателье). Rate limit: 5 заказов / 600 с на IP (`orders:<ip>`).

**Запрос:**
```json
{
  "client_request_id": "0e7c4a19-5b2d-4f8e-9a63-1d0c8b7e2f45",
  "items": [{ "product_id": "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", "quantity": 1 }],
  "expected_total": 13370000,
  "customer": { "name": "Артём Соколов", "phone": "+7 916 555-12-34", "email": "artem.sokolov@yandex.ru" },
  "delivery": { "method": "cdek_pvz", "city": "Казань", "cdek_pvz_code": "KZN45", "address": null, "postal_code": null },
  "vehicle_id": "6f2d8a41-9c3e-4b75-a0d2-3e8f1c7b9d64",
  "vin": "WBAJA11050B123456",
  "comment": "Позвоните перед отправкой",
  "consent_pd": true,
  "consent_offer": true
}
```

**Zod:**
```ts
export const createOrderBody = z.object({
  client_request_id: uuid,
  items: z.array(z.object({ product_id: uuid, quantity: z.number().int().min(1).max(4) })).min(1).max(10)
    .refine((a) => new Set(a.map((i) => i.product_id)).size === a.length, "Один товар — одна позиция"),
  expected_total: kopecks,
  customer: z.object({
    name: z.string().trim().min(2, "Минимум 2 символа").max(100),
    phone: phoneRu,
    email,
  }),
  delivery: z.discriminatedUnion("method", [
    z.object({
      method: z.literal("moscow_courier"),
      city: z.literal("Москва"),
      address: z.string().trim().min(10, "Укажите улицу, дом и квартиру").max(300),
      postal_code: z.string().regex(/^\d{6}$/).nullable(),
      cdek_pvz_code: z.null(),
    }),
    z.object({
      method: z.literal("cdek_pvz"),
      city: z.string().trim().min(2).max(80),
      cdek_pvz_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, "Код ПВЗ из 3–20 латинских букв и цифр"),
      address: z.null(),
      postal_code: z.null(),
    }),
    z.object({
      method: z.literal("cdek_door"),
      city: z.string().trim().min(2).max(80),
      address: z.string().trim().min(10).max(300),
      postal_code: z.string().regex(/^\d{6}$/, "Индекс — 6 цифр"),
      cdek_pvz_code: z.null(),
    }),
  ]),
  vehicle_id: uuid.nullable(),
  vin: z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN — 17 символов без I, O, Q").nullable(),
  comment: z.string().trim().max(1000).nullable(),
  consent_pd: z.literal(true, { error: "Нужно согласие на обработку персональных данных" }),
  consent_offer: z.literal(true, { error: "Нужно принять условия оферты" }),
});
```

**Алгоритм обработчика:**
1. `check_rate_limit('orders:' + ip, 5, 600)`; `ip` = первый адрес из заголовка `x-forwarded-for`.
2. `safeParse` тела.
3. `ctx = await getSessionContext()`.
4. `token = randomBytes(24).toString("base64url")` (32 символа), `token_hash = sha256(token)` в hex.
5. `adminClient.rpc("create_order", { p_order, p_items })`. Ошибки Postgres с `message` из списка в 2.14 переводятся в коды ниже. `DUPLICATE_ITEMS` (повтор `product_id` в позициях) → `400 VALIDATION_ERROR` «Один товар — одна позиция» (обычно перехватывается Zod раньше).
6. Создание платежа ЮKassa (`createPayment` из Блока 5, `Idempotence-Key = "order_" + order_id + "_1"`), сохранение в `payments`.
7. Ответ 201.
8. Если шаг 6 упал — заказ остаётся `pending_payment`, ответ 502 `PAYMENT_PROVIDER_ERROR` с `order_url`, чтобы покупатель мог повторить оплату со страницы заказа.

**Ответ 201:**
```json
{
  "data": {
    "order_id": "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68",
    "order_number": "FC-26-000123",
    "total": 13370000,
    "total_formatted": "133 700 ₽",
    "reserved_until": "2026-10-01T13:00:00.000Z",
    "confirmation_url": "https://yoomoney.ru/checkout/payments/v2/contract?orderId=30a8d2c1-000f-5000-9000-1b6c4d2e8f10",
    "order_url": "https://forgecarbon.vercel.app/orders/FC-26-000123?t=Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU"
  }
}
```

**Ответ 400:**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Проверьте поля формы", "details": { "fields": { "customer.phone": ["Телефон в формате +7 999 123-45-67"], "consent_pd": ["Нужно согласие на обработку персональных данных"] } } } }
```

**Ответ 409 (цены изменились):**
```json
{ "error": { "code": "PRICE_CHANGED", "message": "Цены изменились", "details": { "expected_total": 13370000, "actual_total": 13520000, "actual_total_formatted": "135 200 ₽" } } }
```

**Ответ 409 (нет остатка):**
```json
{ "error": { "code": "OUT_OF_STOCK", "message": "Комплект закончился", "details": { "product_id": "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", "available_qty": 0 } } }
```

**Ответ 409 (смешанная корзина):**
```json
{ "error": { "code": "MIXED_KINDS", "message": "Товары под заказ оформляются отдельным заказом" } }
```

**Ответ 409 (лимит количества):**
```json
{ "error": { "code": "QTY_LIMIT", "message": "Не больше 2 комплектов одного диска в заказе", "details": { "product_id": "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51" } } }
```

**Ответ 410 (товар снят с продажи):**
```json
{ "error": { "code": "PRODUCT_UNAVAILABLE", "message": "Товар больше не продаётся", "details": { "product_id": "d4a7b2c9-1e3f-4a8b-9c6d-2f0e5b8a7c31" } } }
```

**Ответ 429:**
```json
{ "error": { "code": "RATE_LIMITED", "message": "Слишком много попыток оформления. Повторите через 10 минут", "details": { "retry_after_seconds": 600 } } }
```

**Ответ 502:**
```json
{ "error": { "code": "PAYMENT_PROVIDER_ERROR", "message": "Платёжный сервис временно недоступен. Заказ сохранён — оплатите его со страницы заказа", "details": { "order_url": "https://forgecarbon.vercel.app/orders/FC-26-000123?t=Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU" } } }
```

#### `GET /api/orders/[number]?t=<token>`

**Описание:** заказ для страницы статуса. Доступ: `sha256(t) = public_token_hash`, или сессия владельца (`user_id`), или admin. Перед чтением вызывается `cancel_expired_orders()`.
**Авторизация:** токен / владелец / admin.

**Zod:**
```ts
export const orderParams = z.object({ number: z.string().regex(/^FC-\d{2}-\d{6}$/) });
export const orderTokenQuery = z.object({ t: z.string().regex(/^[A-Za-z0-9_-]{32}$/).optional() });
```

Сравнение хэшей — `crypto.timingSafeEqual`.

**Ответ 200:**
```json
{
  "data": {
    "number": "FC-26-000123",
    "kind": "stock",
    "status": "shipped",
    "status_label": "Передан в доставку",
    "timeline": [
      { "status": "paid", "label": "Оплачен", "at": "2026-10-01T12:34:10.000Z", "done": true },
      { "status": "confirmed", "label": "Проверен инженером", "at": "2026-10-01T15:02:44.000Z", "done": true },
      { "status": "shipped", "label": "Передан в доставку", "at": "2026-10-02T10:15:00.000Z", "done": true },
      { "status": "delivered", "label": "Доставлен", "at": null, "done": false }
    ],
    "items": [
      { "title": "Кованый моноблок M-01 R20, 5×112, графит", "quantity": 1, "unit_price_formatted": "133 700 ₽", "line_total_formatted": "133 700 ₽", "product_slug": "forged-m01-r20-5x112-graphite" }
    ],
    "total": 13370000,
    "total_formatted": "133 700 ₽",
    "delivery": { "method": "cdek_pvz", "method_label": "СДЭК — пункт выдачи", "city": "Казань", "cdek_pvz_code": "KZN45", "address": null },
    "tracking": { "number": "1234567890", "url": "https://www.cdek.ru/ru/tracking?order_id=1234567890" },
    "courier_note": null,
    "expected_delivery": { "from": "2026-10-04", "to": "2026-10-07" },
    "expected_ready_at": null,
    "customer_visible_note": null,
    "reserved_until": null,
    "can_pay": false,
    "telegram_subscribed": true,
    "telegram_link": "https://t.me/forgecarbon_bot?start=o_Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU",
    "customer": { "name": "Артём Соколов", "email_masked": "ar***@yandex.ru", "phone_masked": "+7 916 ***-**-34" }
  }
}
```

`telegram_link` возвращается только при доступе по токену (в нём токен). `can_pay = status === "pending_payment" && reserved_until > now`.

**Ответ 404 (нет заказа или неверный токен — один и тот же ответ):**
```json
{ "error": { "code": "NOT_FOUND", "message": "Заказ не найден" } }
```

#### `POST /api/orders/[number]/pay?t=<token>`

**Описание:** новый платёж для заказа в `pending_payment` с действующей бронью (покупатель закрыл страницу ЮKassa). Если для заказа есть платёж `pending` младше 10 минут — возвращается его `confirmation_url` без создания нового.
**Авторизация:** токен / владелец. Rate limit 10 / 600 с на заказ.
**Запрос:** тело пустое `{}`.

**Ответ 200:**
```json
{ "data": { "confirmation_url": "https://yoomoney.ru/checkout/payments/v2/contract?orderId=30a8d2c7-000f-5000-a000-1f3b6c9d2e47" } }
```

**Ответ 409:**
```json
{ "error": { "code": "ORDER_NOT_PAYABLE", "message": "Время на оплату истекло. Оформите заказ заново" } }
```

**Ответ 404:**
```json
{ "error": { "code": "NOT_FOUND", "message": "Заказ не найден" } }
```

**Ответ 502:**
```json
{ "error": { "code": "PAYMENT_PROVIDER_ERROR", "message": "Платёжный сервис временно недоступен. Повторите через минуту" } }
```

---

### Группа: Вебхуки и cron (служебные)

#### `POST /api/webhooks/yookassa`

**Описание:** уведомления ЮKassa о платежах и возвратах. URL указывается в личном кабинете ЮKassa → Интеграция → HTTP-уведомления, события: `payment.succeeded`, `payment.canceled`, `refund.succeeded`.
**Авторизация:** проверка IP-адреса отправителя по списку ЮKassa + повторный запрос объекта в API ЮKassa (тело уведомления не считается доверенным).

**Запрос (от ЮKassa):**
```json
{
  "type": "notification",
  "event": "payment.succeeded",
  "object": {
    "id": "30a8d2c1-000f-5000-9000-1b6c4d2e8f10",
    "status": "succeeded",
    "paid": true,
    "amount": { "value": "133700.00", "currency": "RUB" },
    "payment_method": { "type": "sbp", "id": "30a8d2c1-000f-5000-9000-1b6c4d2e8f10", "saved": false },
    "metadata": { "order_id": "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68", "order_number": "FC-26-000123" },
    "created_at": "2026-10-01T12:31:02.118Z",
    "captured_at": "2026-10-01T12:34:09.553Z"
  }
}
```

**Zod (минимальная форма; данные дальше берутся из повторного GET):**
```ts
export const yookassaWebhookBody = z.object({
  type: z.literal("notification"),
  event: z.enum(["payment.succeeded", "payment.canceled", "payment.waiting_for_capture", "refund.succeeded"]),
  object: z.object({ id: z.string().min(10).max(64) }).passthrough(),
});
```

**Алгоритм:**
1. IP из `x-forwarded-for` (первый адрес) должен входить в сети ЮKassa: `185.71.76.0/27`, `185.71.77.0/27`, `77.75.153.0/25`, `77.75.156.11`, `77.75.156.35`, `77.75.154.128/25`, `2a02:5180::/32`. Иначе — 403.
2. `payment.*`: `GET https://api.yookassa.ru/v3/payments/{id}` → обновить строку `payments` (`status`, `payment_method_type`, `raw`).
   - `succeeded` → `rpc("mark_order_paid", { p_order_id: metadata.order_id, p_amount: rubStringToKopecks(amount.value) })`. Если вернулось `paid` или `paid_needs_attention` — уведомления `admin_order_paid` и `customer_order_paid` (+ `admin_attention`, если флаг).
   - Если вернулось `already_paid`, а у заказа уже есть **другой** платёж со статусом `succeeded` — это повторная оплата: сервер сразу создаёт полный возврат этого платежа (`refunds`, причина «Повторная оплата», `restock = false`), ставит заказу `needs_attention` и отправляет `admin_attention`.
   - `canceled` → только обновление `payments`; заказ не трогается (покупатель может оплатить повторно, пока действует бронь).
3. `refund.succeeded`: `GET /v3/refunds/{id}` → `refunds.status = 'succeeded'` (если запись создана из админки и уже `succeeded` — ничего не делать).
4. Ответ всегда **200** `{ "data": { "received": true } }` после успешной обработки или если объект уже обработан. При ошибке БД — **500**, ЮKassa повторит уведомление.

**Ответ 200:**
```json
{ "data": { "received": true } }
```

**Ответ 400:**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Неверный формат уведомления" } }
```

**Ответ 403:**
```json
{ "error": { "code": "FORBIDDEN", "message": "Источник уведомления не подтверждён" } }
```

**Ответ 500:**
```json
{ "error": { "code": "INTERNAL_ERROR", "message": "Ошибка обработки уведомления" } }
```

#### `POST /api/webhooks/telegram`

**Описание:** апдейты бота. Регистрируется один раз: `GET https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<NEXT_PUBLIC_SITE_URL>/api/webhooks/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>&allowed_updates=["message"]` (скрипт `scripts/set-telegram-webhook.ts`, запускается `npx tsx scripts/set-telegram-webhook.ts`).
**Авторизация:** заголовок `X-Telegram-Bot-Api-Secret-Token` должен равняться `TELEGRAM_WEBHOOK_SECRET`, иначе 403.

**Запрос (от Telegram):**
```json
{
  "update_id": 829104772,
  "message": {
    "message_id": 41,
    "from": { "id": 512398764, "is_bot": false, "first_name": "Артём", "language_code": "ru" },
    "chat": { "id": 512398764, "type": "private", "first_name": "Артём" },
    "date": 1790846100,
    "text": "/start o_Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU"
  }
}
```

**Zod:**
```ts
export const telegramUpdate = z.object({
  update_id: z.number().int(),
  message: z.object({
    chat: z.object({ id: z.number().int(), type: z.string() }),
    text: z.string().max(4096).optional(),
  }).passthrough().optional(),
}).passthrough();
```

**Логика команд:**
- `/start o_<token>` → найти заказ по `sha256(token)`; записать `orders.telegram_chat_id = chat.id`; ответить «Подписка на заказ FC-26-000123 оформлена. Текущий статус: Оплачен». Не найден → «Ссылка недействительна. Откройте страницу заказа из письма и нажмите кнопку ещё раз».
- `/start fit_<vehicle_id>` → ответить «Напишите модель, год и что ищете — инженер ответит в этом чате в рабочее время (10:00–20:00 МСК)» и переслать сообщение в `TELEGRAM_ADMIN_CHAT_ID` с текстом «Запрос подбора: BMW 5 Series G30, чат 512398764».
- `/stop` → обнулить `telegram_chat_id` у всех заказов этого чата, ответить «Уведомления отключены».
- Любой другой текст от не-админа → переслать в `TELEGRAM_ADMIN_CHAT_ID` (`forwardMessage`) и ответить «Передал инженеру. Ответим в рабочее время».

**Ответ 200 (всегда, чтобы Telegram не повторял):**
```json
{ "data": { "ok": true } }
```

**Ответ 403:**
```json
{ "error": { "code": "FORBIDDEN", "message": "Неверный секрет" } }
```

#### `GET /api/cron/daily`

**Описание:** ежедневные задачи (Блок 5, «Cron»). Вызывается Vercel Cron.
**Авторизация:** заголовок `Authorization: Bearer <CRON_SECRET>` (Vercel добавляет его автоматически, если переменная `CRON_SECRET` задана).

`vercel.json`:
```json
{ "crons": [{ "path": "/api/cron/daily", "schedule": "0 6 * * *" }] }
```

**Ответ 200:**
```json
{
  "data": {
    "rates": { "USD": { "rate": 83.56, "date": "2026-10-01", "inserted": true }, "CNY": { "rate": 11.72, "date": "2026-10-01", "inserted": true } },
    "repriced_products": 18,
    "cancelled_orders": 2,
    "notifications": { "sent": 1, "failed": 0, "remaining": 0 },
    "rate_limit_rows_deleted": 412
  }
}
```

**Ответ 401:**
```json
{ "error": { "code": "UNAUTHORIZED", "message": "Неверный CRON_SECRET" } }
```

**Ответ 500 (частичный сбой — шаги независимы, ошибки собираются):**
```json
{ "error": { "code": "INTERNAL_ERROR", "message": "Часть задач не выполнена", "details": { "failed_steps": ["rates"], "rates_error": "CBR timeout after 10000 ms" } } }
```

---

### Группа: Аккаунт и ателье

#### `GET /api/account/orders?page=1`

**Описание:** заказы текущего пользователя.
**Авторизация:** сессия (customer, atelier).

**Zod:** `z.object({ page })`

**Ответ 200:**
```json
{
  "data": [
    { "number": "FC-26-000131", "created_at": "2026-10-05T09:12:00.000Z", "status": "paid", "status_label": "Оплачен", "kind": "preorder", "total_formatted": "98 600 ₽", "items_count": 1, "url": "/orders/FC-26-000131" }
  ],
  "meta": { "total": 1, "page": 1, "per_page": 20 }
}
```

**Ответ 401:**
```json
{ "error": { "code": "UNAUTHORIZED", "message": "Войдите в аккаунт" } }
```

#### `GET /api/ateliers/me`

**Описание:** статус заявки ателье текущего пользователя.
**Авторизация:** сессия.

**Ответ 200 (заявка есть):**
```json
{ "data": { "id": "e1c7a3b9-5d2f-4e8a-9b06-3f1d7c2e8a54", "company_name": "Garage 77", "inn": "7801234567", "city": "Санкт-Петербург", "status": "pending", "status_label": "На рассмотрении", "rejection_reason": null, "created_at": "2026-10-01T14:20:00.000Z" } }
```

**Ответ 200 (заявки нет):**
```json
{ "data": null }
```

**Ответ 404 (FEATURE_ATELIER = false):**
```json
{ "error": { "code": "FEATURE_DISABLED", "message": "Раздел для ателье скоро откроется" } }
```

#### `POST /api/ateliers`

**Описание:** подать заявку (или повторно — после отказа). Rate limit 3 / 3600 с на пользователя.
**Авторизация:** сессия.

**Запрос:**
```json
{ "company_name": "Garage 77", "inn": "7801234567", "city": "Санкт-Петербург", "contact_name": "Илья Ветров", "phone": "+7 921 300-40-50", "website": "https://vk.com/garage77spb", "comment": "Ставим диски и обвесы на BMW и Audi, 15–20 машин в месяц" }
```

**Zod:**
```ts
// Контрольная сумма ИНН (10 и 12 цифр) по алгоритму ФНС.
export function isValidInn(inn: string): boolean {
  const d = inn.split("").map(Number);
  const check = (w: number[]) => (w.reduce((s, k, i) => s + k * d[i], 0) % 11) % 10;
  if (d.length === 10) return check([2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[9];
  if (d.length === 12)
    return check([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[10]
      && check([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[11];
  return false;
}

export const atelierApplyBody = z.object({
  company_name: z.string().trim().min(2).max(120),
  inn: z.string().trim().regex(/^(\d{10}|\d{12})$/, "ИНН — 10 или 12 цифр")
       .refine(isValidInn, "Проверьте ИНН — контрольная сумма не совпадает"),
  city: z.string().trim().min(2).max(80),
  contact_name: z.string().trim().min(2).max(100),
  phone: phoneRu,
  website: z.string().trim().max(200).pipe(z.url()).nullable(),
  comment: z.string().trim().max(1000).nullable(),
});
```

**Ответ 201:**
```json
{ "data": { "id": "e1c7a3b9-5d2f-4e8a-9b06-3f1d7c2e8a54", "status": "pending", "status_label": "На рассмотрении" } }
```

**Ответ 400:**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Проверьте поля формы", "details": { "fields": { "inn": ["Проверьте ИНН — контрольная сумма не совпадает"] } } } }
```

**Ответ 409:**
```json
{ "error": { "code": "ALREADY_APPLIED", "message": "Заявка уже на рассмотрении" } }
```

---

### Группа: Админка — товары

Все `/api/admin/*` начинаются с проверки `role === "admin"` (см. 3.0) и работают через клиент с сессией (RLS проверяет `is_admin()` повторно), кроме мест, где явно указан service-role.

#### `GET /api/admin/products`

**Параметры:** `type?` (`wheel_set`|`carbon_part`), `status?` (`draft`|`active`|`archived`), `q?` (поиск по title/sku, 2–60 символов, `ilike`), `page`.

**Zod:**
```ts
export const adminProductsQuery = z.object({
  type: z.enum(["wheel_set", "carbon_part"]).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  q: z.string().trim().min(2).max(60).optional(),
  page,
});
```

**Ответ 200:**
```json
{
  "data": [
    {
      "id": "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", "type": "wheel_set", "sku": "FCF-M01-2085-GR",
      "title": "Кованый моноблок M-01 R20, 5×112, графит", "status": "active",
      "availability_mode": "stock", "stock_qty": 4, "reserved_qty": 1, "available_qty": 3,
      "purchase_currency": "USD", "purchase_cost": 80000, "purchase_cost_formatted": "$800.00",
      "pricing_mode": "auto", "price": 13370000, "price_formatted": "133 700 ₽",
      "price_atelier": 11800000, "price_atelier_formatted": "118 000 ₽",
      "images_count": 5, "updated_at": "2026-10-01T09:05:00.000Z"
    }
  ],
  "meta": { "total": 27, "page": 1, "per_page": 20 }
}
```

**Ответ 401/403:** `UNAUTHORIZED` / `FORBIDDEN`, JSON — в 3.0.

#### `POST /api/admin/products`

**Запрос (комплект дисков):**
```json
{
  "type": "wheel_set",
  "slug": "forged-m01-r20-5x112-graphite",
  "sku": "FCF-M01-2085-GR",
  "title": "Кованый моноблок M-01 R20, 5×112, графит",
  "manufacturer": "ForgeCarbon Forged",
  "description": "Кованый моноблок из алюминиевого сплава 6061-T6. Комплект из 4 дисков: передние 8.5J ET30, задние 9.5J ET40.",
  "status": "draft",
  "availability_mode": "stock",
  "stock_qty": 4,
  "lead_time_min_days": null,
  "lead_time_max_days": null,
  "purchase_currency": "USD",
  "purchase_cost": 80000,
  "pricing_mode": "auto",
  "price": null,
  "price_atelier": 11800000,
  "wheel": {
    "diameter_in": 20, "width_front_in": 8.5, "width_rear_in": 9.5, "et_front_mm": 30, "et_rear_mm": 40,
    "pcd": "5x112", "center_bore_mm": 66.6, "seat_type": "cone60", "includes_hub_rings": false,
    "includes_fasteners": false, "construction": "forged_monoblock", "finish": "Графит, сатин", "weight_kg": 9.8
  },
  "warranty_months": 24,
  "certifications": [],
  "claims_verified": false,
  "compatible_vehicle_ids": []
}
```

**Zod:**
```ts
const wheelFields = z.object({
  diameter_in: z.number().int().min(15).max(24),
  width_front_in: z.number().min(6).max(13).multipleOf(0.5),
  width_rear_in: z.number().min(6).max(13).multipleOf(0.5).nullable(),
  et_front_mm: z.number().int().min(-20).max(70),
  et_rear_mm: z.number().int().min(-20).max(70).nullable(),
  pcd: z.string().regex(/^[4-6]x\d{3}(\.\d)?$/, "Формат 5x112"),
  center_bore_mm: z.number().min(50).max(90).multipleOf(0.1),
  seat_type: z.enum(["cone60", "ball_r13", "ball_r14", "flat"]),
  includes_hub_rings: z.boolean(),
  includes_fasteners: z.boolean(),
  construction: z.enum(["cast", "flow_formed", "forged_monoblock", "forged_2pc", "forged_3pc"]),
  finish: z.string().trim().max(60).nullable(),
  weight_kg: z.number().min(3).max(30).nullable(),
});

export const productUpsertBody = z.object({
  type: z.enum(["wheel_set", "carbon_part"]),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Только латиница, цифры и дефис").max(120),
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,40}$/),
  title: z.string().trim().min(3).max(140),
  manufacturer: z.string().trim().min(2).max(60),
  description: z.string().trim().max(5000),
  status: z.enum(["draft", "active", "archived"]),
  availability_mode: z.enum(["stock", "preorder"]),
  stock_qty: z.number().int().min(0).max(1000),
  lead_time_min_days: z.number().int().min(1).max(180).nullable(),
  lead_time_max_days: z.number().int().min(1).max(180).nullable(),
  purchase_currency: z.enum(["USD", "CNY", "RUB"]),
  purchase_cost: z.number().int().positive(),
  pricing_mode: z.enum(["auto", "manual"]),
  price: kopecks.nullable(),
  price_atelier: kopecks.nullable(),
  wheel: wheelFields.nullable(),
  warranty_months: z.number().int().min(0).max(120),
  certifications: z.array(z.enum(["TÜV", "JWL", "VIA", "KBA"])).max(4),
  claims_verified: z.boolean(),
  compatible_vehicle_ids: z.array(uuid).max(200),
}).superRefine((v, ctx) => {
  if (v.type === "wheel_set" && !v.wheel) ctx.addIssue({ code: "custom", path: ["wheel"], message: "Заполните параметры диска" });
  if (v.type === "carbon_part" && v.availability_mode !== "preorder") ctx.addIssue({ code: "custom", path: ["availability_mode"], message: "Карбон продаётся только под заказ" });
  if (v.availability_mode === "preorder" && (!v.lead_time_min_days || !v.lead_time_max_days || v.lead_time_max_days < v.lead_time_min_days))
    ctx.addIssue({ code: "custom", path: ["lead_time_max_days"], message: "Укажите срок поставки «от» и «до»" });
  if (v.pricing_mode === "manual" && !v.price) ctx.addIssue({ code: "custom", path: ["price"], message: "Укажите цену" });
  if (v.price_atelier && v.price && v.price_atelier > v.price) ctx.addIssue({ code: "custom", path: ["price_atelier"], message: "Цена ателье не может быть выше розничной" });
  if (v.certifications.length > 0 && !v.claims_verified) ctx.addIssue({ code: "custom", path: ["claims_verified"], message: "Сертификации публикуются только после подтверждения" });
});
```

**Логика:** при `pricing_mode = "auto"` сервер считает `price` функцией `computeAutoPrice` (Блок 5) по последнему курсу; при `status = "active"` и 0 фото — ошибка `VALIDATION_ERROR` «Добавьте хотя бы одно фото» (при создании товар всегда можно сохранить только как `draft`, фото загружаются после создания, публикация — через PATCH).

**Ответ 201:**
```json
{ "data": { "id": "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", "slug": "forged-m01-r20-5x112-graphite", "status": "draft", "price": 13370000, "price_formatted": "133 700 ₽", "price_calculation": "800.00 USD × 83.5600 × 2.00 = 133 696 ₽ → 133 700 ₽" } }
```

**Ответ 400:**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Проверьте поля формы", "details": { "fields": { "wheel": ["Заполните параметры диска"] } } } }
```

**Ответ 409 (slug):**
```json
{ "error": { "code": "SLUG_TAKEN", "message": "Такой адрес уже используется", "details": { "suggestion": "forged-m01-r20-5x112-graphite-2" } } }
```

**Ответ 409 (sku):**
```json
{ "error": { "code": "SKU_TAKEN", "message": "Артикул FCF-M01-2085-GR уже есть в каталоге" } }
```

**Ответ 422 (нет курса):**
```json
{ "error": { "code": "RATE_NOT_LOADED", "message": "Курс USD не загружен. Загрузите курс или задайте цену вручную" } }
```

#### `GET /api/admin/products/[id]`

**Ответ 200:** объект в формате тела `POST /api/admin/products` + поля `id`, `price`, `price_updated_at`, `reserved_qty`, `available_qty`, `images` (`[{ "id": "2b9c1d7e-0a4f-4c3e-8d21-7f5e6a9b0c13", "url": "https://abcdefghijklmnop.supabase.co/storage/v1/object/public/product-images/products/8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51/2b9c1d7e-0a4f-4c3e-8d21-7f5e6a9b0c13.webp", "alt": "Кованый диск M-01 графит, вид спереди", "sort_order": 0 }]`), `created_at`, `updated_at`.

**Ответ 404:**
```json
{ "error": { "code": "NOT_FOUND", "message": "Товар не найден" } }
```

#### `PATCH /api/admin/products/[id]`

**Запрос:** любое подмножество полей `productUpsertBody` + `"updated_at"` из последнего GET (оптимистическая блокировка). Пример — публикация с изменением остатка:
```json
{ "status": "active", "stock_qty": 6, "updated_at": "2026-10-01T09:05:00.000Z" }
```

**Zod:** `productUpsertBody.partial().extend({ updated_at: z.iso.datetime() })` + те же `superRefine` проверки поверх объединения с текущей записью.

**Логика:** `update ... where id = $1 and updated_at = $2`; 0 строк → 409 `CONFLICT`.

**Ответ 200:**
```json
{ "data": { "id": "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", "status": "active", "stock_qty": 6, "updated_at": "2026-10-01T09:41:17.000Z" } }
```

**Ответ 409:**
```json
{ "error": { "code": "CONFLICT", "message": "Товар изменили в другой вкладке. Обновите страницу" } }
```

**Ответ 400 (публикация без фото):**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Добавьте хотя бы одно фото", "details": { "fields": { "images": ["Добавьте хотя бы одно фото"] } } } }
```

#### `DELETE /api/admin/products/[id]`

**Логика:** если товар есть в `order_items` — 409, предлагается архив. Иначе удаляется строка и файлы `products/<id>/*` из Storage.

**Ответ 200:**
```json
{ "data": { "deleted": true } }
```

**Ответ 409:**
```json
{ "error": { "code": "CONFLICT", "message": "Товар есть в заказах. Переведите его в архив" } }
```

#### `POST /api/admin/products/[id]/images`

**Запрос:** `multipart/form-data`, поле `file` (JPEG/PNG/WebP, ≤ 5 МБ), поле `alt` (≤ 200 символов).
**Логика:** путь `products/<product_id>/<random uuid>.<ext>`, загрузка через сессионный клиент Supabase Storage, затем insert в `product_images` с `sort_order` = текущее количество.

**Zod:**
```ts
export const imageUploadForm = z.object({
  file: z.instanceof(File)
    .refine((f) => f.size <= 5 * 1024 * 1024, "Файл больше 5 МБ")
    .refine((f) => ["image/jpeg", "image/png", "image/webp"].includes(f.type), "Только JPG, PNG или WebP"),
  alt: z.string().trim().max(200).default(""),
});
```

**Ответ 201:**
```json
{ "data": { "id": "9f4e2d1c-3b7a-4e6f-b0a8-5c2d7e1f3a96", "url": "https://abcdefghijklmnop.supabase.co/storage/v1/object/public/product-images/products/8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51/9f4e2d1c-3b7a-4e6f-b0a8-5c2d7e1f3a96.webp", "alt": "Макро спиц M-01", "sort_order": 1 } }
```

**Ответ 400:**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Файл больше 5 МБ" } }
```

**Ответ 409:**
```json
{ "error": { "code": "IMAGES_LIMIT", "message": "У товара уже 8 фото" } }
```

#### `PATCH /api/admin/products/[id]/images`

**Описание:** порядок и подписи фото.

**Запрос:**
```json
{ "images": [
  { "id": "9f4e2d1c-3b7a-4e6f-b0a8-5c2d7e1f3a96", "sort_order": 0, "alt": "Макро спиц M-01" },
  { "id": "2b9c1d7e-0a4f-4c3e-8d21-7f5e6a9b0c13", "sort_order": 1, "alt": "Кованый диск M-01 графит, вид спереди" }
] }
```

**Zod:**
```ts
export const imagesReorderBody = z.object({
  images: z.array(z.object({ id: uuid, sort_order: z.number().int().min(0).max(7), alt: z.string().trim().max(200) })).min(1).max(8),
});
```

**Ответ 200:**
```json
{ "data": { "updated": 2 } }
```

**Ответ 404:**
```json
{ "error": { "code": "NOT_FOUND", "message": "Фото 9f4e2d1c-3b7a-4e6f-b0a8-5c2d7e1f3a96 не принадлежит товару" } }
```

#### `DELETE /api/admin/products/[id]/images/[imageId]`

**Логика:** удалить файл из Storage, затем строку; если товар `active` и это последнее фото — 409.

**Ответ 200:**
```json
{ "data": { "deleted": true } }
```

**Ответ 409:**
```json
{ "error": { "code": "CONFLICT", "message": "Нельзя удалить единственное фото опубликованного товара" } }
```

---

### Группа: Админка — автомобили

#### `GET /api/admin/vehicles?make=BMW&page=1`

**Zod:** `z.object({ make: make.optional(), q: z.string().trim().min(1).max(60).optional(), page })`

**Ответ 200:**
```json
{
  "data": [
    { "id": "6f2d8a41-9c3e-4b75-a0d2-3e8f1c7b9d64", "make": "BMW", "model": "5 Series", "generation": "G30", "year_from": 2017, "year_to": 2023, "pcd": "5x112", "center_bore_mm": 66.6, "seat_type": "cone60", "fastener_spec": "Болт M14×1.25", "diameter_min_in": 18, "diameter_max_in": 21, "width_min_in": 8.0, "width_max_in": 10.0, "et_min_mm": 20, "et_max_mm": 40, "is_active": true, "fitting_products_count": 6 }
  ],
  "meta": { "total": 13, "page": 1, "per_page": 20 }
}
```

#### `POST /api/admin/vehicles`

**Запрос:**
```json
{ "make": "BMW", "model": "7 Series", "generation": "G11", "year_from": 2015, "year_to": 2022, "pcd": "5x112", "center_bore_mm": 66.6, "seat_type": "cone60", "fastener_spec": "Болт M14×1.25", "diameter_min_in": 18, "diameter_max_in": 21, "width_min_in": 8.0, "width_max_in": 10.0, "et_min_mm": 20, "et_max_mm": 45, "is_active": true }
```

**Zod:**
```ts
export const vehicleUpsertBody = z.object({
  make,
  model: z.string().trim().min(1).max(60),
  generation: z.string().trim().min(1).max(30),
  year_from: z.number().int().min(1990).max(2100),
  year_to: z.number().int().min(1990).max(2100).nullable(),
  pcd: z.string().regex(/^[4-6]x\d{3}(\.\d)?$/),
  center_bore_mm: z.number().min(50).max(90).multipleOf(0.1),
  seat_type: z.enum(["cone60", "ball_r13", "ball_r14", "flat"]),
  fastener_spec: z.string().trim().min(3).max(60),
  diameter_min_in: z.number().int().min(15).max(24),
  diameter_max_in: z.number().int().min(15).max(24),
  width_min_in: z.number().min(6).max(13).multipleOf(0.5),
  width_max_in: z.number().min(6).max(13).multipleOf(0.5),
  et_min_mm: z.number().int().min(-20).max(70),
  et_max_mm: z.number().int().min(-20).max(70),
  is_active: z.boolean(),
}).refine((v) => v.year_to === null || v.year_to >= v.year_from, { path: ["year_to"], message: "Год окончания раньше года начала" })
  .refine((v) => v.diameter_max_in >= v.diameter_min_in, { path: ["diameter_max_in"], message: "Максимум меньше минимума" })
  .refine((v) => v.width_max_in >= v.width_min_in, { path: ["width_max_in"], message: "Максимум меньше минимума" })
  .refine((v) => v.et_max_mm >= v.et_min_mm, { path: ["et_max_mm"], message: "Максимум меньше минимума" });
```

**Ответ 201:**
```json
{ "data": { "id": "f5a2c8e1-3b9d-4f7a-8e60-2d4c1b9e7f36", "label": "BMW 7 Series G11 · 2015–2022" } }
```

**Ответ 409:**
```json
{ "error": { "code": "CONFLICT", "message": "BMW 7 Series G11 уже есть в справочнике" } }
```

#### `PATCH /api/admin/vehicles/[id]`

**Запрос:** подмножество `vehicleUpsertBody`, например `{ "et_max_mm": 42 }`.

**Ответ 200:**
```json
{ "data": { "id": "6f2d8a41-9c3e-4b75-a0d2-3e8f1c7b9d64", "et_max_mm": 42, "fitting_products_count": 7 } }
```

**Ответ 404:**
```json
{ "error": { "code": "NOT_FOUND", "message": "Автомобиль не найден" } }
```

#### `DELETE /api/admin/vehicles/[id]`

**Логика:** если на автомобиль ссылаются заказы — ссылка обнулится (`SET NULL`), это допустимо; в UI основное действие — «Скрыть» (`is_active = false`), удаление — через подтверждение.

**Ответ 200:**
```json
{ "data": { "deleted": true } }
```

**Ответ 404:**
```json
{ "error": { "code": "NOT_FOUND", "message": "Автомобиль не найден" } }
```

#### `PUT /api/admin/products/[id]/vehicles`

**Описание:** полная замена списка совместимых автомобилей для карбоновой детали.

**Запрос:**
```json
{ "vehicle_ids": ["c8b2e5d1-7f3a-4c9e-a1d6-4b0e8f2c7a95"] }
```

**Zod:** `z.object({ vehicle_ids: z.array(uuid).max(200) })`

**Ответ 200:**
```json
{ "data": { "product_id": "a3e9c1b7-2d4f-4e8a-b6c0-1f7d9e3a5b28", "vehicle_ids": ["c8b2e5d1-7f3a-4c9e-a1d6-4b0e8f2c7a95"] } }
```

**Ответ 400:**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Совместимость задаётся только для карбона. Для дисков она рассчитывается по параметрам" } }
```

---

### Группа: Админка — заказы

#### `GET /api/admin/orders`

**Параметры:** `status?`, `kind?`, `attention?` (`true`), `q?` (номер заказа, email или телефон), `page`.

**Zod:**
```ts
export const orderStatus = z.enum(["pending_payment", "paid", "confirmed", "ordered_from_supplier", "in_transit", "arrived", "shipped", "delivered", "cancelled", "refunded"]);
export const adminOrdersQuery = z.object({
  status: orderStatus.optional(),
  kind: z.enum(["stock", "preorder"]).optional(),
  attention: z.coerce.boolean().optional(),
  q: z.string().trim().min(3).max(60).optional(),
  page,
});
```

**Ответ 200:**
```json
{
  "data": [
    {
      "id": "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68", "number": "FC-26-000123", "created_at": "2026-10-01T12:30:41.000Z",
      "kind": "stock", "status": "paid", "status_label": "Оплачен", "price_tier": "retail",
      "customer_name": "Артём Соколов", "customer_phone": "+79165551234", "customer_email": "artem.sokolov@yandex.ru",
      "delivery_label": "СДЭК ПВЗ · Казань · KZN45", "total": 13370000, "total_formatted": "133 700 ₽",
      "needs_attention": false, "attention_reason": null, "vehicle_label": "BMW 5 Series G30 · 2017–2023"
    }
  ],
  "meta": { "total": 41, "page": 1, "per_page": 20 }
}
```

#### `GET /api/admin/orders/[id]`

**Ответ 200:**
```json
{
  "data": {
    "id": "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68", "number": "FC-26-000123", "kind": "stock", "status": "paid",
    "allowed_transitions": ["confirmed"],
    "customer": { "name": "Артём Соколов", "phone": "+79165551234", "email": "artem.sokolov@yandex.ru" },
    "delivery": { "method": "cdek_pvz", "city": "Казань", "cdek_pvz_code": "KZN45", "address": null, "postal_code": null },
    "vehicle_label": "BMW 5 Series G30 · 2017–2023", "vin": "WBAJA11050B123456", "customer_comment": "Позвоните перед отправкой",
    "items": [
      { "product_id": "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", "title": "Кованый моноблок M-01 R20, 5×112, графит", "sku": "FCF-M01-2085-GR", "specs": { "type": "wheel_set", "diameter_in": 20, "width_front_in": 8.5, "width_rear_in": 9.5, "et_front_mm": 30, "et_rear_mm": 40, "pcd": "5x112", "center_bore_mm": 66.6 }, "quantity": 1, "unit_price_formatted": "133 700 ₽", "line_total_formatted": "133 700 ₽" }
    ],
    "total": 13370000, "total_formatted": "133 700 ₽",
    "paid_amount": 13370000, "refunded_amount": 0, "refundable_amount": 13370000,
    "payments": [ { "yookassa_payment_id": "30a8d2c1-000f-5000-9000-1b6c4d2e8f10", "status": "succeeded", "method": "sbp", "amount_formatted": "133 700 ₽", "created_at": "2026-10-01T12:31:02.000Z" } ],
    "refunds": [],
    "history": [
      { "from_status": null, "to_status": "pending_payment", "note": "Заказ создан", "changed_by_name": null, "created_at": "2026-10-01T12:30:41.000Z" },
      { "from_status": "pending_payment", "to_status": "paid", "note": "Оплата подтверждена ЮKassa", "changed_by_name": null, "created_at": "2026-10-01T12:34:10.000Z" }
    ],
    "tracking_number": null, "courier_note": null, "admin_note": null, "customer_visible_note": null,
    "expected_ready_at": null, "needs_attention": false, "attention_reason": null,
    "telegram_subscribed": true, "consent_pd_at": "2026-10-01T12:30:41.000Z", "consent_policy_version": "2026-10-01",
    "updated_at": "2026-10-01T12:34:10.000Z"
  }
}
```

**Ответ 404:**
```json
{ "error": { "code": "NOT_FOUND", "message": "Заказ не найден" } }
```

#### `PATCH /api/admin/orders/[id]/status`

**Описание:** переход статуса по таблице из Блока 5. Отправляет уведомление покупателю (`customer_status_changed`).

**Запрос:**
```json
{ "to_status": "shipped", "tracking_number": "1234567890", "courier_note": null, "note": "Отправлено СДЭК, страховка на полную стоимость", "updated_at": "2026-10-01T15:02:44.000Z" }
```

**Zod:**
```ts
export const orderStatusChangeBody = z.object({
  to_status: orderStatus.exclude(["pending_payment", "paid", "refunded"]),  // paid — только webhook, refunded — только через refund
  tracking_number: z.string().trim().regex(/^[A-Za-z0-9-]{5,40}$/).nullable().default(null),
  courier_note: z.string().trim().max(300).nullable().default(null),
  note: z.string().trim().max(500).nullable().default(null),
  updated_at: z.iso.datetime(),
});
```

**Логика:** проверить `to_status ∈ allowedTransitions(kind, status)`; для `shipped` при СДЭК — обязателен `tracking_number`, при курьере — `courier_note`; для `cancelled` из `paid` и далее — запрещено (только возврат); записать `shipped_at`/`delivered_at`; insert в `order_status_history` с `changed_by = user.id`.

**Ответ 200:**
```json
{ "data": { "id": "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68", "status": "shipped", "status_label": "Передан в доставку", "allowed_transitions": ["delivered"], "updated_at": "2026-10-02T10:15:00.000Z" } }
```

**Ответ 400:**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Укажите трек-номер СДЭК", "details": { "fields": { "tracking_number": ["Укажите трек-номер СДЭК"] } } } }
```

**Ответ 409 (переход):**
```json
{ "error": { "code": "INVALID_STATUS_TRANSITION", "message": "Из статуса «Оплачен» нельзя перейти в «Доставлен»", "details": { "from": "paid", "to": "delivered", "allowed": ["confirmed"] } } }
```

**Ответ 409 (конкурентное изменение):**
```json
{ "error": { "code": "CONFLICT", "message": "Заказ изменили в другой вкладке. Обновите страницу" } }
```

#### `PATCH /api/admin/orders/[id]`

**Описание:** заметки, трек, ожидаемая дата (без смены статуса). Изменение `expected_ready_at` или `customer_visible_note` отправляет покупателю уведомление «Срок поставки изменился».

**Запрос:**
```json
{ "expected_ready_at": "2026-11-12", "customer_visible_note": "Задержка на таможне", "admin_note": "Поставщик обещает отгрузку 01.11", "updated_at": "2026-10-20T08:00:00.000Z" }
```

**Zod:**
```ts
export const orderMetaPatchBody = z.object({
  expected_ready_at: z.iso.date().nullable().optional(),
  customer_visible_note: z.string().trim().max(500).nullable().optional(),
  admin_note: z.string().trim().max(2000).nullable().optional(),
  tracking_number: z.string().trim().regex(/^[A-Za-z0-9-]{5,40}$/).nullable().optional(),
  courier_note: z.string().trim().max(300).nullable().optional(),
  needs_attention: z.boolean().optional(),
  updated_at: z.iso.datetime(),
});
```

**Ответ 200:**
```json
{ "data": { "id": "7c3a9e1b-4f2d-4b8e-a6c1-9d0e3f5b2a87", "expected_ready_at": "2026-11-12", "customer_notified": true, "updated_at": "2026-10-20T08:01:12.000Z" } }
```

**Ответ 409:**
```json
{ "error": { "code": "CONFLICT", "message": "Заказ изменили в другой вкладке. Обновите страницу" } }
```

#### `POST /api/admin/orders/[id]/refund`

**Запрос:**
```json
{ "amount": 13370000, "reason": "Клиент отказался до отправки", "restock": true }
```

**Zod:**
```ts
export const refundBody = z.object({
  amount: kopecks,
  reason: z.string().trim().min(5, "Минимум 5 символов").max(500),
  restock: z.boolean(),
});
```

**Логика:**
1. `refundable = paid_amount − сумма refunds со статусом pending|succeeded`. `amount > refundable` → 422.
2. Insert `refunds` (`status = 'pending'`).
3. `POST https://api.yookassa.ru/v3/refunds` с `Idempotence-Key = "refund_" + refund.id`, телом `{ payment_id, amount: { value: "133700.00", currency: "RUB" }, description: "Возврат по заказу FC-26-000123", receipt }` (receipt — те же позиции, что в платеже, пропорционально сумме; при полном возврате — все позиции).
4. Ответ ЮKassa `succeeded` → `refunds.status = 'succeeded'`; если сумма возвратов = оплате → заказ `refunded` + история; если `restock && kind = 'stock'` и заказ не был `delivered` → `rpc("restock_order")`; уведомление `customer_refund`.
5. Ответ `canceled` или ошибка HTTP → `refunds.status = 'failed'`, `error_message`, ответ 502.

**Ответ 200:**
```json
{ "data": { "refund_id": "b2d8f4a1-6c3e-4a9b-8f07-1e5c9d3a7b62", "yookassa_refund_id": "2ec4b1f0-0015-5000-8000-1d7e2a9c4b36", "status": "succeeded", "amount_formatted": "133 700 ₽", "order_status": "refunded" } }
```

**Ответ 422:**
```json
{ "error": { "code": "REFUND_EXCEEDS_PAID", "message": "Максимум к возврату: 133 700 ₽", "details": { "refundable_amount": 13370000 } } }
```

**Ответ 502:**
```json
{ "error": { "code": "PAYMENT_PROVIDER_ERROR", "message": "ЮKassa отклонила возврат: Недостаточно средств на балансе магазина", "details": { "yookassa_code": "invalid_request" } } }
```

---

### Группа: Админка — ателье, настройки, сводка

#### `GET /api/admin/ateliers?status=pending&page=1`

**Zod:** `z.object({ status: z.enum(["pending", "approved", "rejected"]).optional(), page })`

**Ответ 200:**
```json
{
  "data": [
    { "id": "e1c7a3b9-5d2f-4e8a-9b06-3f1d7c2e8a54", "company_name": "Garage 77", "inn": "7801234567", "city": "Санкт-Петербург", "contact_name": "Илья Ветров", "phone": "+79213004050", "email": "ilya@garage77.ru", "website": "https://vk.com/garage77spb", "comment": "Ставим диски и обвесы на BMW и Audi, 15–20 машин в месяц", "status": "pending", "orders_count": 0, "created_at": "2026-10-01T14:20:00.000Z" }
  ],
  "meta": { "total": 3, "page": 1, "per_page": 20 }
}
```

#### `PATCH /api/admin/ateliers/[id]`

**Запрос (одобрить):**
```json
{ "status": "approved", "rejection_reason": null }
```

**Запрос (отклонить):**
```json
{ "status": "rejected", "rejection_reason": "Не нашли информации об ателье. Пришлите ссылку на сайт или соцсети" }
```

**Zod:**
```ts
export const atelierReviewBody = z.discriminatedUnion("status", [
  z.object({ status: z.literal("approved"), rejection_reason: z.null() }),
  z.object({ status: z.literal("rejected"), rejection_reason: z.string().trim().min(10).max(500) }),
]);
```

**Логика (service-role):** обновить `ateliers.status`, `reviewed_at`; при `approved` — `profiles.role = 'atelier'`; при `rejected` — `profiles.role = 'customer'` (если был atelier); уведомление `atelier_approved` / `atelier_rejected` на email пользователя.

**Ответ 200:**
```json
{ "data": { "id": "e1c7a3b9-5d2f-4e8a-9b06-3f1d7c2e8a54", "status": "approved", "reviewed_at": "2026-10-02T09:00:00.000Z" } }
```

**Ответ 409:**
```json
{ "error": { "code": "CONFLICT", "message": "Ателье с ИНН 7801234567 уже одобрено под другим аккаунтом" } }
```

#### `GET /api/admin/settings`

**Ответ 200:**
```json
{
  "data": {
    "markup_multiplier": 2.0, "price_rounding_rub": 100, "auto_reprice": true, "reprice_threshold": 2.0,
    "rates": { "USD": { "rate": 83.56, "date": "2026-10-01" }, "CNY": { "rate": 11.72, "date": "2026-10-01" } },
    "updated_at": "2026-10-01T06:00:12.000Z"
  }
}
```

#### `PATCH /api/admin/settings`

**Запрос:**
```json
{ "markup_multiplier": 2.0, "price_rounding_rub": 100, "auto_reprice": true, "reprice_threshold": 2.0 }
```

**Zod:**
```ts
export const settingsPatchBody = z.object({
  markup_multiplier: z.number().min(1).max(5).multipleOf(0.01).optional(),
  price_rounding_rub: z.union([z.literal(1), z.literal(10), z.literal(100), z.literal(1000)]).optional(),
  auto_reprice: z.boolean().optional(),
  reprice_threshold: z.number().min(0).max(20).optional(),
});
```

**Ответ 200:**
```json
{ "data": { "markup_multiplier": 2.0, "price_rounding_rub": 100, "auto_reprice": true, "reprice_threshold": 2.0, "updated_at": "2026-10-01T10:00:00.000Z" } }
```

**Ответ 400:**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Множитель от 1.00 до 5.00" } }
```

#### `POST /api/admin/exchange-rates/refresh`

**Описание:** загрузить курс ЦБ немедленно (тот же код, что шаг 1 cron).
**Запрос:** `{}`.

**Ответ 200:**
```json
{ "data": { "USD": { "rate": 83.56, "date": "2026-10-01", "inserted": false }, "CNY": { "rate": 11.72, "date": "2026-10-01", "inserted": false } } }
```

**Ответ 502:**
```json
{ "error": { "code": "PAYMENT_PROVIDER_ERROR", "message": "Сайт ЦБ не ответил за 10 секунд. Повторите позже" } }
```

#### `POST /api/admin/prices/recalculate`

**Описание:** пересчитать все `pricing_mode = 'auto'` товары по последнему курсу. `dry_run: true` — только показать изменения.

**Запрос:**
```json
{ "dry_run": true }
```

**Zod:** `z.object({ dry_run: z.boolean() })`

**Ответ 200:**
```json
{
  "data": {
    "dry_run": true,
    "changes": [
      { "product_id": "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", "title": "Кованый моноблок M-01 R20, 5×112, графит", "old_price_formatted": "133 700 ₽", "new_price_formatted": "135 200 ₽" }
    ],
    "unchanged": 17
  }
}
```

**Ответ 422:**
```json
{ "error": { "code": "RATE_NOT_LOADED", "message": "Курс USD не загружен" } }
```

#### `GET /api/admin/summary`

**Описание:** данные для `/admin`. Одновременно запускает отправку просроченных уведомлений из `notification_queue` (не более 10 за вызов).

**Ответ 200:**
```json
{
  "data": {
    "orders_to_process": 3,
    "orders_attention": 1,
    "preorders_in_progress": 2,
    "ateliers_pending": 1,
    "low_stock": [ { "product_id": "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", "title": "Кованый моноблок M-01 R20, 5×112, графит", "available_qty": 1 } ],
    "month": { "paid_orders": 7, "revenue": 79820000, "revenue_formatted": "798 200 ₽", "goal_orders": 15 },
    "rates_date": "2026-10-01",
    "notifications_failed": 0
  }
}
```

---
## БЛОК 4: UI/UX

### 4.0 Дизайн-система

Генератор требует нейтральную схему без выдуманного бренда. Бренд здесь не выдуман — он задан в Идее (раздел «Настроение и бренд»): тёмная тема, графит, серебро, один акцент только на кнопках. Используются ровно эти цвета.

`src/app/globals.css` (Tailwind v4, токены shadcn):

```css
@import "tailwindcss";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-silver: var(--silver);
  --color-success: var(--success);
  --color-destructive: var(--destructive);
  --font-sans: var(--font-inter);
  --font-mono: var(--font-jetbrains);
  --radius-lg: 0.5rem;
}

:root {
  --background: #0A0A0B;          /* глубокий чёрный */
  --foreground: #F2F2F3;
  --card: #141416;                /* графит */
  --muted: #1C1C1F;
  --muted-foreground: #8A8A93;
  --border: #2A2A2E;
  --silver: #C0C4CC;              /* серебро / титан — второстепенные акценты, бейджи */
  --primary: #E6FF00;             /* кислотно-жёлтый — ТОЛЬКО кнопки основного действия */
  --primary-foreground: #0A0A0B;
  --success: #3DDC84;             /* только точка «В наличии» */
  --destructive: #FF4D4F;
}

html { color-scheme: dark; }
body { background: var(--background); color: var(--foreground); }
```

- Тема одна — тёмная. Переключателя светлой темы нет (бренд из Идеи).
- Шрифты: `Inter` (кириллица) через `next/font/google` как `--font-inter`; `JetBrains Mono` как `--font-jetbrains` — для характеристик (ET, PCD, ЦО), цен в таблицах и номеров заказов.
- Цифры в ценах: класс `tabular-nums`.
- Кнопка основного действия (`Button variant="default"`) — жёлтая. Все остальные — `variant="outline"` или `"ghost"` с серебряной обводкой. На одном экране не больше одной жёлтой кнопки.
- Тексты интерфейса короткие и фактологичные (Идея): «Доступно к заказу», «Кованый моноблок». Запрещённые слова в интерфейсе: «хит продаж», «скидка», «акция», «последний шанс», «дёшево».
- Брейкпоинты Tailwind: mobile `< 768px`, tablet `md: 768–1023px`, desktop `lg: ≥ 1024px`. Контейнер `max-w-7xl mx-auto px-4 md:px-6`.
- Фото товара: `next/image`, `sizes` указаны явно, `placeholder="empty"`, фон карточки `bg-card`; соотношение 1:1 для дисков, 4:3 для карбона.
- shadcn-компоненты, устанавливаемые командой `npx shadcn@latest add`: `button card badge select input textarea label checkbox radio-group form sheet dialog alert-dialog table tabs skeleton sonner separator dropdown-menu pagination tooltip breadcrumb scroll-area switch command popover`.

Общие компоненты (`src/components/shop`):

| Компонент | Что показывает |
|-----------|----------------|
| `SiteHeader` | Логотип-текст `SITE_NAME` (mono, uppercase, tracking-widest), навигация «Диски» `/wheels`, «Карбон» `/carbon`, «Ателье» `/atelier`, `VehicleBadge`, кнопка корзины (иконка `ShoppingBag` + счётчик `Badge`), кнопка «Войти» (иконка `User`) / меню аккаунта (`DropdownMenu`) |
| `VehicleBadge` | Выбранный автомобиль из `localStorage` `fc_vehicle` («BMW 5 Series G30») + кнопка `X` сброса; без автомобиля — ссылка «Выбрать авто» (иконка `Car`) |
| `VehicleSelector` | 3–4 `Select` + кнопка «Показать диски» (иконка `ArrowRight`). Режимы: `hero` (крупный, на главной) и `compact` (в `Sheet` из шапки) |
| `ProductCard` | `Card`: фото, название (2 строки, `line-clamp-2`), `specs_short` (mono, muted), `AvailabilityBadge`, цена; для ателье — две цены |
| `AvailabilityBadge` | Точка + текст: `success` «В наличии в Москве» / `silver` «Под заказ · 21–35 дней» / `muted-foreground` «Нет в наличии» |
| `FitmentNote` | `CircleCheck` «Подходит для BMW 5 Series G30» / `CircleX` «Не подходит…» / `CircleHelp` «Выберите авто, чтобы проверить совместимость» |
| `PriceTag` | Цена `formatRub`; для ателье — «Для ателье: 118 000 ₽» + зачёркнутая розничная |
| `CartSheet` | `Sheet side="right"`: позиции, итог, кнопки «Оформить заказ» и «Перейти в корзину» |
| `SiteFooter` | Ссылки: Доставка, Гарантия и возврат, Оферта, Политика ПДн, Контакты; «Только по России»; «© 2026 ForgeCarbon» |

Форматирование денег `src/lib/money.ts`:

```ts
const rub = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const formatRub = (kopecks: number) => rub.format(kopecks / 100); // 13370000 → "133 700 ₽"
// Целочисленный разбор без float; невалидная строка → исключение (NaN/0 не должны доходить до mark_order_paid).
export const rubStringToKopecks = (v: string): number => {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(v.trim());
  if (!m) throw new Error(`Invalid RUB amount: ${JSON.stringify(v)}`);
  const kopecks = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")); // "133700.00" → 13370000
  if (!Number.isSafeInteger(kopecks)) throw new Error(`RUB amount out of range: ${JSON.stringify(v)}`);
  return kopecks;
};
export const kopecksToRubString = (k: number) => (k / 100).toFixed(2);       // 13370000 → "133700.00"
```

Глобальные состояния:
- `src/app/not-found.tsx`: заголовок «Страница не найдена», кнопки «На главную» и «Каталог дисков».
- `src/app/error.tsx` (клиентский): «Что-то пошло не так» + кнопка «Повторить» (`reset()`) + ссылка «На главную».
- Тосты: `<Toaster position="top-center" theme="dark" richColors />` в корневом layout; на mobile — `bottom-center`.

### 4.1 Layouts

| Layout | Файл | Состав |
|--------|------|--------|
| Shop | `src/app/(shop)/layout.tsx` | `SiteHeader` (sticky, `bg-background/80 backdrop-blur`) + `main` + `SiteFooter` + скрипт Яндекс Метрики (если `NEXT_PUBLIC_YM_COUNTER_ID` не пустой) |
| Auth | `src/app/auth/layout.tsx` | Центрированная `Card` `max-w-sm`, логотип сверху, ссылка «На главную» |
| Admin | `src/app/admin/layout.tsx` | Серверная проверка `role = 'admin'` (иначе `redirect('/')`). Desktop: левый sidebar 240px (пункты с иконками: `LayoutDashboard` Сводка, `Package` Заказы, `Disc3` Товары, `Car` Автомобили, `Building2` Ателье, `Settings` Настройки) + main. Mobile: верхняя панель с кнопкой `Menu`, sidebar открывается в `Sheet side="left"` |

---

### Экран: Главная

**Путь:** `/` | **Layout:** Shop

**Компоненты:**
- `Hero`: фон — фото макро карбона/диска (`/public/hero.webp`, затемнение `bg-black/60`), заголовок «Диски и карбон для Audi, BMW, Mercedes-Benz», подзаголовок «Склад в Москве. Доставка до 5 дней», `VehicleSelector mode="hero"`.
- `ValueStrip`: три колонки с иконками — `Warehouse` «Склад в Москве», `Truck` «Доставка по России бесплатно, со страховкой», `ShieldCheck` «Гарантия до 24 месяцев».
- `FeaturedWheels`: 4 `ProductCard` — последние активные `wheel_set` с `available_qty > 0` (`GET /api/products?type=wheel_set&availability=in_stock&sort=newest`, первые 4).
- `FeaturedCarbon`: 4 `ProductCard` карбона.
- `HowItWorks`: 3 шага — «Выберите авто» → «Оплатите картой или СБП» → «Получите за 1–5 дней».
- `AtelierTeaser`: «Для тюнинг-ателье — отдельные цены» + кнопка `outline` «Подробнее» → `/atelier` (скрыт при `FEATURE_ATELIER = false`).

**Состояния:**
- **Loading:** `VehicleSelector` — `Select` «Марка» с `Skeleton` внутри; витрины — 4 `Skeleton` карточки (`aspect-square` + 2 строки).
- **Empty:** если в наличии 0 дисков — блок `FeaturedWheels` заменяется текстом «Новая партия готовится к поступлению» и кнопкой `outline` «Смотреть под заказ» → `/wheels`. Пустой карбон — блок скрыт.
- **Error:** витрина не загрузилась — блок скрыт, toast не показывается (главная не должна выглядеть сломанной); `VehicleSelector` — inline «Не удалось загрузить марки. Повторить».

**Действия:**
1. Выбор марки → `GET /api/vehicles/models?make=` → разблокируется «Модель».
2. Выбор модели → `GET /api/vehicles/years` → разблокируется «Год».
3. Выбор года → `GET /api/vehicles/resolve` → один результат: кнопка «Показать диски» активна; несколько — появляется `Select` «Поколение».
4. «Показать диски» → `localStorage.fc_vehicle = { id, label }` → `router.push('/wheels?vehicle=<id>')`, цель Метрики `fitment_selected`.
5. Клик по `ProductCard` → `/product/[slug]`.

**Responsive:**
- Desktop: hero на высоту 70vh, селектор в одну строку (4 колонки + кнопка); витрины — 4 колонки.
- Tablet: селектор 2×2 + кнопка на всю ширину; витрины — 2 колонки.
- Mobile: селектор столбиком, `Select` на всю ширину, кнопка sticky внизу hero; витрины — горизонтальный скролл (`ScrollArea`, карточки 75% ширины).

---

### Экран: Каталог дисков

**Путь:** `/wheels` (параметры: `vehicle`, `diameter`, `construction`, `availability`, `sort`, `page`) | **Layout:** Shop

**Компоненты:**
- `Breadcrumb`: Главная / Диски.
- `CatalogHeader`: заголовок «Диски» или «Диски для BMW 5 Series G30» (если выбран автомобиль), счётчик «14 позиций».
- `FitmentBanner` (если выбран автомобиль): параметры авто в mono «5×112 · ЦО 66.6 · ET 20–40 · R18–R21 · Болт M14×1.25 (конус 60°)» + кнопка `ghost` «Сменить авто» (иконка `RefreshCw`, открывает `Sheet` с `VehicleSelector mode="compact"`).
- `CatalogFilters`: `Select` «Диаметр» (R17–R23), `Tabs` «Все / Литые / Кованые», `Switch` «Только в наличии», `Select` «Сортировка» (Сначала новые / Дешевле / Дороже). Все фильтры пишутся в URL (`router.replace`, без скролла вверх).
- `ProductGrid`: `ProductCard` с `FitmentNote` (компактный вариант: только иконка + «Подходит», если в карточке `fitment.needs_hub_rings` — `Tooltip` «Центровочные кольца в комплекте»).
- `Pagination` (shadcn) — по 24.

**Состояния:**
- **Loading:** 8 `Skeleton`-карточек (desktop), 4 (mobile); фильтры активны.
- **Empty (с автомобилем):** иконка `Disc3`, текст «Для BMW 5 Series G30 подходящих дисков сейчас нет», две кнопки: `default` «Написать инженеру» (иконка `Send`, ссылка `https://t.me/<TELEGRAM_BOT_USERNAME>?start=fit_<vehicle_id>`), `outline` «Показать все диски».
- **Empty (из-за фильтров):** «Ничего не найдено по фильтрам» + `outline` «Сбросить фильтры».
- **Error:** inline-блок `Alert` «Не удалось загрузить каталог» + кнопка «Повторить»; при 404 по `vehicle` — повтор без `vehicle` + toast «Автомобиль не найден, показаны все диски» + очистка `localStorage.fc_vehicle`.

**Действия:**
1. Изменение фильтра → обновление URL → новый `GET /api/products` (данные через серверный компонент страницы + `searchParams`).
2. «Сменить авто» → `Sheet` с селектором → новый `vehicle` в URL.
3. Клик по карточке → `/product/[slug]?vehicle=<id>`, цель Метрики `product_view` на странице товара.

**Responsive:**
- Desktop: фильтры горизонтальной панелью над сеткой, сетка 4 колонки.
- Tablet: сетка 3 колонки, фильтры в 2 строки.
- Mobile: сетка 2 колонки (карточка компактная: фото, цена, бейдж; `specs_short` скрыт), фильтры — кнопка `outline` «Фильтры» (иконка `SlidersHorizontal`) открывает `Sheet side="bottom"`.

---

### Экран: Каталог карбона

**Путь:** `/carbon` (параметры: `vehicle`, `sort`, `page`) | **Layout:** Shop

**Компоненты:** как у каталога дисков, кроме: заголовок «Карбон под заказ», под ним строка «Срок поставки 21–45 дней · 100% предоплата · гарантия»; фильтры — только сортировка; карточки 4:3; `FitmentBanner` без технических параметров (только название авто).

**Состояния:**
- **Loading:** 8 `Skeleton` 4:3.
- **Empty (с автомобилем):** «Для BMW M4 G82 карбона в каталоге пока нет. Найдём под заказ» + `default` «Написать инженеру» (Telegram `fit_<vehicle_id>`).
- **Empty (без автомобиля, каталог пуст):** «Каталог карбона готовится» + `outline` «Смотреть диски».
- **Error:** `Alert` «Не удалось загрузить каталог» + «Повторить».

**Действия:** те же, что у дисков.

**Responsive:** desktop 3 колонки, tablet 2, mobile 1 (карточка горизонтальная: фото слева 40%, текст справа).

---

### Экран: Карточка товара

**Путь:** `/product/[slug]` | **Layout:** Shop

**Компоненты:**
- `Breadcrumb`: Главная / Диски (или Карбон) / Название.
- `ProductGallery`: главное фото + до 7 миниатюр; клик по главному — `Dialog` полноэкранного просмотра со стрелками (`ChevronLeft`, `ChevronRight`), свайп на mobile.
- `ProductInfo`: производитель (muted, uppercase), название `h1`, `PriceTag`, «за комплект из 4 дисков» / «за 1 шт.», `AvailabilityBadge`, строка доставки.
- `FitmentNote` (полный вариант) + для дисков `fastener_note`.
- `QuantityStepper` (кнопки `Minus`/`Plus`, 1…`max_quantity`).
- Кнопка `default` «В корзину» (иконка `ShoppingBag`) — единственная жёлтая на экране.
- Кнопка `outline` «Задать вопрос инженеру» (иконка `Send`) → Telegram-бот.
- `SpecsTable` (shadcn `Table`, mono): Диаметр R20 · Ширина 8.5J / 9.5J · Вылет ET30 / ET40 · Разболтовка 5×112 · ЦО 66.6 мм · Посадка крепежа: конус 60° · Конструкция: кованый моноблок · Покрытие: графит, сатин · Вес диска 9.8 кг · Кольца в комплекте: нет · Крепёж в комплекте: нет · Гарантия 24 мес. · Сертификации (только при `claims_verified`).
- Для карбона вместо `SpecsTable` — список «Подходит для» (`compatible_vehicles`).
- `Description`: текст описания, `whitespace-pre-line`.
- `DeliveryInfo`: «Москва — курьер, 1–2 дня», «Регионы — СДЭК, 2–5 рабочих дней», «Доставка бесплатная, груз застрахован», «Оплата картой или СБП, 100% предоплата».

**Состояния:**
- **Loading:** `Skeleton` квадрат галереи + 6 строк справа.
- **Empty:** не применяется (товар без фото не публикуется); если галерея пуста из-за удалённого файла — плейсхолдер `bg-card` с иконкой `ImageOff`.
- **Error:** 404 → «Товар больше не продаётся» + «В каталог»; ошибка добавления в корзину → toast из ответа `POST /api/cart/validate`.

**Действия:**
1. «В корзину»:
   - если корзина пуста или того же `kind` → `POST /api/cart/validate` с новой позицией → при `problem = null` запись в `localStorage.fc_cart_v1`, открыть `CartSheet`, цель Метрики `add_to_cart`;
   - если корзина другого `kind` → `AlertDialog` «Детали под заказ и диски из наличия оформляются разными заказами» с кнопками «Оформить текущую корзину» (→ `/checkout`) и «Заменить корзину»;
   - если `FitmentNote` = «Не подходит» → сначала `AlertDialog` «Этот диск не подходит к BMW 5 Series G30. Всё равно добавить?».
2. Повторное «В корзину» того же товара увеличивает количество, но не выше `max_quantity` (toast «Максимум 2 комплекта одного диска в заказе»).

**Responsive:**
- Desktop: 2 колонки (галерея 7/12, инфо 5/12, инфо sticky при скролле).
- Tablet: 2 колонки 1:1.
- Mobile: 1 колонка; галерея — карусель со свайпом и точками; кнопка «В корзину» — sticky-панель внизу экрана с ценой.

---

### Экран: Корзина

**Путь:** `/cart` (+ тот же контент в `CartSheet`) | **Layout:** Shop

**Компоненты:**
- `CartLineItem`: фото 80×80, название (ссылка), `specs_short`, `QuantityStepper`, цена позиции, кнопка удаления (иконка `Trash2`), строка проблемы (`problem`) красным/серебряным.
- `CartKindNote`: для `preorder` — «Под заказ · 100% предоплата · срок поставки до 35 дней».
- `CartSummary` (`Card`): «Товары 133 700 ₽», «Доставка — бесплатно», «Итого 133 700 ₽», кнопка `default` «Оформить заказ» (иконка `ArrowRight`), под ней «Оплата картой или СБП».

**Состояния:**
- **Loading:** при открытии — позиции из `localStorage` показываются сразу, цены — `Skeleton` до ответа `POST /api/cart/validate`.
- **Empty:** иконка `ShoppingBag`, «Корзина пуста», кнопки `default` «Подобрать диски» → `/` и `outline` «Карбон» → `/carbon`.
- **Error:** validate не ответил — `Alert` «Не удалось проверить наличие. Повторить», кнопка «Оформить заказ» заблокирована.

**Действия:**
1. Изменение количества → debounce 400 мс → `POST /api/cart/validate` → обновление сумм.
2. Удаление → позиция исчезает, toast «Удалено» с действием «Вернуть» (5 с).
3. `problem = "out_of_stock" | "unavailable"` → позиция затемнена, `Badge` «Нет в наличии», «Оформить заказ» заблокирована, подсказка «Удалите недоступные позиции».
4. `problem = "qty_reduced"` → toast «Доступно только 1 комплект, количество уменьшено».
5. «Оформить заказ» → `/checkout`, цель Метрики `checkout_started`.

**Responsive:** desktop — список 8/12 + `CartSummary` 4/12 sticky; tablet — то же 7/5; mobile — список, `CartSummary` sticky-панель внизу (итог + кнопка).

---

### Экран: Оформление заказа

**Путь:** `/checkout` | **Layout:** Shop (упрощённый: в шапке только логотип и ссылка «Вернуться в корзину», иконка `ChevronLeft`)

**Компоненты (одна форма `react-hook-form` + `zodResolver(createOrderBody)`):**
- Секция «Контакты»: `Input` «Имя и фамилия», `Input type="tel"` «Телефон» (маска `+7 (999) 999-99-99` — собственный обработчик onChange, без библиотеки), `Input type="email"` «Email — пришлём ссылку на заказ».
- Секция «Доставка»: `RadioGroup` из трёх `Card`-вариантов:
  - «Курьер по Москве · 1–2 дня · бесплатно» (иконка `Truck`) → поля «Адрес (улица, дом, квартира)», «Индекс» (необязательно). Город фиксирован «Москва».
  - «СДЭК — пункт выдачи · 2–5 дней · бесплатно» (иконка `Package`) → поля «Город», «Код пункта выдачи СДЭК» + подсказка-ссылка «Найти пункт на карте СДЭК» (`https://www.cdek.ru/ru/offices`, `target="_blank"`).
  - «СДЭК — до двери · 2–5 дней · бесплатно» (иконка `House`) → «Город», «Адрес», «Индекс».
- Секция «Автомобиль»: если в `localStorage` есть авто — показан с кнопкой «Изменить»; `Input` «VIN (необязательно) — инженер сверит совместимость».
- `Textarea` «Комментарий к заказу» (до 1000 символов, счётчик).
- `Checkbox` «Даю согласие на обработку персональных данных согласно Политике» (ссылка `/privacy`, новая вкладка).
- `Checkbox` «Принимаю условия публичной оферты» (ссылка `/offer`).
- `OrderSummary` (`Card`): позиции, итог, кнопка `default` «Перейти к оплате · 133 700 ₽» (иконка `Lock`), под ней логотипы-текстом «Банковская карта · СБП», «Оплата на защищённой странице ЮKassa».

**Состояния:**
- **Loading:** при загрузке — `POST /api/cart/validate`, `OrderSummary` в `Skeleton`; при отправке — кнопка `disabled` + `Loader2 animate-spin` + текст «Создаём заказ…», вся форма `disabled`.
- **Empty:** корзина пуста → `redirect('/cart')`.
- **Error:** ошибки полей — inline под полем (`FormMessage`), первое ошибочное поле получает фокус и скролл; `PRICE_CHANGED` → `AlertDialog` (US-003 шаг 8); `OUT_OF_STOCK` / `PRODUCT_UNAVAILABLE` → toast + redirect `/cart`; `MIXED_KINDS` → redirect `/cart`; `RATE_LIMITED` → toast с текстом ответа; `PAYMENT_PROVIDER_ERROR` → `AlertDialog` «Платёжный сервис временно недоступен. Заказ FC-26-000123 сохранён на 30 минут» + кнопка «Перейти к заказу» (`order_url`); сеть недоступна → toast «Нет соединения. Данные формы сохранены» (форма дублируется в `sessionStorage` `fc_checkout_draft` при каждом изменении, кроме согласий).

**Действия:**
1. Отправка → генерируется `client_request_id` (`crypto.randomUUID()`, сохраняется в `sessionStorage` на время попытки, чтобы повтор после сетевой ошибки ушёл с тем же id) → `POST /api/orders`.
2. 201 → корзина очищается (`localStorage.removeItem('fc_cart_v1')`), черновик формы удаляется, `window.location.assign(confirmation_url)`.

**Responsive:** desktop — форма 7/12 + `OrderSummary` 5/12 sticky; tablet — одна колонка, `OrderSummary` над кнопкой; mobile — одна колонка, `OrderSummary` свёрнут в `Accordion`-подобный блок «Состав заказа · 133 700 ₽» (по клику раскрывается), кнопка оплаты sticky внизу.

---

### Экран: Статус заказа

**Путь:** `/orders/[number]?t=<token>` | **Layout:** Shop

**Компоненты:**
- Заголовок «Заказ FC-26-000123» (mono) + `Badge` статуса.
- `PaymentBanner` (только при возврате с ЮKassa, пока статус `pending_payment`): «Проверяем оплату…» со спиннером; страница опрашивает `GET /api/orders/[number]` каждые 3 с до 60 с. Затем либо статус сменился, либо «Оплата пока не поступила» + кнопка `default` «Оплатить» (`POST /api/orders/[number]/pay`) + таймер «Бронь действует ещё 18 мин».
- `OrderTimeline`: вертикальный список шагов (иконки: `CircleCheck` выполнено, `Circle` впереди, `Clock` текущий). Шаги для `stock`: Оплачен → Проверен инженером → Передан в доставку → Доставлен. Для `preorder`: Оплачен → Заказан у поставщика → Едет в Москву → Прибыл на склад → Передан в доставку → Доставлен.
- `ExpectedDate`: «Ожидаемая доставка: 4–7 октября» или для preorder «Ожидаем на складе к 5 ноября».
- `CustomerNote`: `Alert` с `customer_visible_note`, если есть.
- `TrackingCard`: трек-номер (кнопка копирования `Copy`) + ссылка «Отследить в СДЭК» (`ExternalLink`); для курьера — `courier_note`.
- `OrderItems`, итог, способ доставки, маскированные контакты.
- Кнопка `outline` «Получать статусы в Telegram» (иконка `Send`) → `telegram_link`; если подписан — текст «Статусы приходят в Telegram» (иконка `BellRing`).
- Блок «Вопрос по заказу?» → ссылка на Telegram-бот.

**Состояния:**
- **Loading:** `Skeleton` заголовка, 4 строки таймлайна, карточка состава.
- **Empty:** не применяется (заказ всегда содержит позиции).
- **Error:** 404 → «Заказ не найден. Проверьте ссылку из письма»; ошибка опроса → тихий повтор, после 3 неудач — inline «Не удалось обновить статус. Обновите страницу».
- Отменённый заказ: `Alert` «Заказ отменён: Не оплачен за 30 минут» + `default` «Оформить заново» (возвращает позиции в корзину по `product_slug`).
- Возвращённый: `Alert` «Деньги возвращены: 133 700 ₽. Срок зачисления зависит от банка, обычно до 10 рабочих дней».

**Действия:**
1. Статус стал `paid` при опросе → цель Метрики `payment_succeeded` (один раз, флаг в `sessionStorage`).
2. «Оплатить» → новый `confirmation_url` → переход.
3. Копирование трек-номера → toast «Трек-номер скопирован».

**Responsive:** desktop — 2 колонки (таймлайн + трек слева 7/12, состав справа 5/12); tablet и mobile — одна колонка, порядок: статус, таймлайн, трек, состав.

---

### Экран: Для ателье

**Путь:** `/atelier` | **Layout:** Shop | 404 при `FEATURE_ATELIER = false`

**Компоненты:**
- Заголовок «Для тюнинг-ателье», 3 пункта: «Отдельные цены после проверки», «Склад в Москве — без ожидания», «Заказы ваших клиентов в одном кабинете».
- Не залогинен: кнопки `default` «Зарегистрироваться» (`/auth/register?next=/atelier`) и `outline` «Войти».
- Залогинен, заявки нет: `AtelierApplyForm` (`Form` + `atelierApplyBody`): Название, ИНН, Город, Контактное лицо, Телефон, Сайт или соцсети, Комментарий, `default` «Отправить заявку».
- Заявка `pending`: `Card` «Заявка на рассмотрении с 01.10.2026. Обычно отвечаем в течение 1 рабочего дня» (иконка `Clock`).
- `approved`: `Card` «Цены для ателье активны» (иконка `BadgeCheck`) + кнопка «В каталог».
- `rejected`: `Alert` с `rejection_reason` + форма, заполненная прошлыми данными, кнопка «Подать повторно».

**Состояния:**
- **Loading:** `Skeleton` формы (7 полей).
- **Empty:** состояние «заявки нет» = форма (см. выше).
- **Error:** inline-ошибки полей; `ALREADY_APPLIED` → перезагрузка статуса; прочее → toast «Не удалось отправить заявку. Повторите».

**Действия:** «Отправить заявку» → `POST /api/ateliers` → карточка `pending` + toast «Заявка отправлена».

**Responsive:** desktop — текст 5/12 + форма 7/12; tablet и mobile — одна колонка.

---

### Экраны: Вход, Регистрация, Восстановление пароля

**Пути:** `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/update-password` | **Layout:** Auth

**Компоненты:**
- Login: `Input` Email, `Input type="password"` Пароль (кнопка показа `Eye`/`EyeOff`), `default` «Войти», ссылки «Забыли пароль?», «Нет аккаунта? Зарегистрироваться».
- Register: Имя, Email, Пароль (подсказка «8–72 символа, буква и цифра»), `default` «Создать аккаунт», текст «Аккаунт нужен ателье. Для покупки в розницу регистрация не требуется» + ссылка «В каталог».
- Forgot: Email, `default` «Отправить ссылку».
- Update: Новый пароль, Повтор пароля, `default` «Сохранить пароль».

**Состояния:**
- **Loading:** кнопка `disabled` + `Loader2`.
- **Empty:** не применяется (формы).
- **Error:**
  - неверные данные входа → inline над кнопкой «Неверный email или пароль»;
  - email не подтверждён → inline «Подтвердите email. Отправить письмо повторно?» + кнопка `ghost` (`supabase.auth.resend({ type: 'signup', email })`);
  - email уже зарегистрирован → inline «Этот email уже зарегистрирован. Войти?»;
  - лимит Supabase (429) → «Слишком много попыток. Повторите через минуту»;
  - устаревшая ссылка восстановления → «Ссылка устарела. Запросите новую».
- Успех регистрации: экран «Проверьте почту artem@yandex.ru — там ссылка для подтверждения» (иконка `MailCheck`).
- Успех forgot: «Если аккаунт с таким email есть, письмо отправлено».

**Действия:** см. Блок 5, «Аутентификация». После входа — redirect на `next` (только относительные пути, начинающиеся с `/` и не с `//`), иначе `/account`; admin — `/admin`.

**Responsive:** `Card` `max-w-sm` на всех размерах; на mobile — без рамки карточки, `px-4`.

---

### Экран: Личный кабинет

**Путь:** `/account` | **Layout:** Shop

**Компоненты:**
- Заголовок «Аккаунт», email, кнопка `ghost` «Выйти» (иконка `LogOut`).
- `AtelierStatusCard` (если `FEATURE_ATELIER`): статус заявки или ссылка «Вы ателье? Подать заявку».
- `OrdersTable` (`Table`): Номер (ссылка), Дата, Состав (кол-во позиций), Сумма, Статус (`Badge`). Пагинация по 20.
- Форма профиля: Имя, Телефон, `outline` «Сохранить» (обновление через сессионный Supabase-клиент, колонки `full_name`, `phone`).

**Состояния:**
- **Loading:** `Skeleton` таблицы (5 строк).
- **Empty:** «Заказов пока нет» + `default` «Подобрать диски».
- **Error:** inline `Alert` «Не удалось загрузить заказы» + «Повторить».

**Действия:** клик по строке → `/orders/[number]` (доступ по владению, без токена); «Выйти» → `supabase.auth.signOut()` → `/`.

**Responsive:** desktop/tablet — таблица; mobile — таблица превращается в список `Card` (номер, статус, сумма, дата).

---

### Экраны: Статичные страницы

**Пути:** `/delivery`, `/warranty`, `/privacy`, `/offer`, `/contacts` | **Layout:** Shop

**Компоненты:** `h1` + текст в `prose prose-invert max-w-3xl` (плагин `@tailwindcss/typography`). Контент — MDX-файлы `src/content/*.mdx`, которые владелец редактирует сам. Обязательное содержание:
- `/delivery`: способы и сроки из Блока 5, «доставка бесплатная, груз застрахован», «только по России», оплата 100% картой/СБП.
- `/warranty`: срок гарантии указан в карточке; порядок обращения (Telegram/email, фото, номер заказа); возврат товара надлежащего качества — 7 дней с момента получения, если сохранены товарный вид и упаковка; деньги возвращаются тем же способом в течение 10 дней с даты получения возвращённого товара; на установленные диски со следами монтажа возврат не распространяется.
- `/privacy`: оператор ПДн (ФИО/наименование ИП, ИНН, email — из констант `src/lib/legal.ts`), состав данных (имя, телефон, email, адрес, VIN), цели (исполнение заказа, доставка, связь), хранение (Supabase), передача (СДЭК — для доставки, ЮKassa — для оплаты), срок хранения (3 года после исполнения заказа), порядок отзыва согласия (email оператора). Версия политики = `PRIVACY_POLICY_VERSION`.
- `/offer`: продавец (из `legal.ts`), предмет, порядок оформления и 100% предоплаты, доставка, возврат (ссылка на `/warranty`), реквизиты.
- `/contacts`: Telegram-бот, email `SMTP_USER`, «Склад: Москва» (точный адрес не публикуется — самовывоза в MVP нет), часы ответа 10:00–20:00 МСК.

`src/lib/legal.ts` содержит реквизиты продавца отдельными константами (`SELLER_NAME`, `SELLER_INN`, `SELLER_OGRNIP`, `SELLER_EMAIL`). Сайт не публикуется в продакшн, пока они не заполнены: `next build` падает, если любая из констант — пустая строка (проверка в `next.config.ts`).

**Состояния:** Loading/Empty/Error не применяются — страницы статически генерируются при сборке.

**Responsive:** одна колонка, `max-w-3xl`, на mobile `text-base`, заголовки `text-2xl`.

---

### Экран: Админка — Сводка

**Путь:** `/admin` | **Layout:** Admin

**Компоненты:**
- 4 `Card`-метрики: «К обработке» (`orders_to_process` — статус `paid`), «Требуют внимания» (`orders_attention`, иконка `TriangleAlert`, красная обводка если > 0), «Под заказ в пути» (`preorders_in_progress`), «Заявки ателье» (`ateliers_pending`). Клик ведёт в отфильтрованный список.
- `Card` «Месяц»: оплаченные заказы «7 из 15» с `Progress`-полосой, выручка.
- `Card` «Заканчиваются» — товары с `available_qty ≤ 1`, ссылка на редактирование.
- Строка «Курс ЦБ от 01.10.2026»; если дата старше 3 дней — `Alert` «Курс не обновлялся 3 дня» + кнопка «Загрузить курс».
- `notifications_failed > 0` → `Alert` «3 уведомления не доставлены» (детали в логах Vercel).

**Состояния:**
- **Loading:** 4 `Skeleton`-карточки + 2 блока.
- **Empty:** нулевые значения показываются как «0», блок «Заканчиваются» — «Остатки в норме».
- **Error:** `Alert` «Не удалось загрузить сводку» + «Повторить».

**Действия:** клик по метрике → `/admin/orders?status=paid` и т.д.; «Загрузить курс» → `POST /api/admin/exchange-rates/refresh` → toast «Курс USD 83,56 ₽ на 01.10.2026».

**Responsive:** desktop — 4 колонки метрик; tablet — 2; mobile — 1.

---

### Экран: Админка — Заказы

**Путь:** `/admin/orders` | **Layout:** Admin

**Компоненты:**
- `Tabs` по статусам: «Оплачен», «Проверен», «Под заказ» (все preorder-статусы до `arrived`), «Отправлен», «Доставлен», «Ожидает оплаты», «Отменён/возврат», «Все».
- `Input` поиска (иконка `Search`): номер, email или телефон; debounce 400 мс.
- `Switch` «Требуют внимания».
- `Table`: Номер (mono), Дата (`dd.MM HH:mm` МСК), Клиент, Доставка, Сумма, Тип (`Badge` «Наличие»/«Под заказ»), Статус (`Badge`), иконка `TriangleAlert` при `needs_attention`.
- `Pagination` по 20.

**Состояния:**
- **Loading:** `Skeleton` 10 строк таблицы.
- **Empty:** «Заказов в этом статусе нет» (иконка `Inbox`); при поиске — «Ничего не найдено по запросу «FC-26-0009»».
- **Error:** `Alert` + «Повторить».

**Действия:** клик по строке → `/admin/orders/[id]`; смена вкладки/поиска → URL-параметры → новый запрос.

**Responsive:** desktop/tablet — таблица (на tablet скрыты колонки «Доставка» и «Тип»); mobile — список `Card`.

---

### Экран: Админка — Заказ

**Путь:** `/admin/orders/[id]` | **Layout:** Admin

**Компоненты:**
- Шапка: номер, `Badge` статуса, дата, кнопки допустимых переходов из `allowed_transitions` (основная — `default`, остальные `outline`), кнопка `outline` «Оформить возврат» (иконка `Undo2`, видна при `refundable_amount > 0`).
- `Alert` destructive при `needs_attention` с `attention_reason` и кнопкой «Снять отметку».
- `Card` «Клиент»: имя, телефон (`tel:`-ссылка), email (`mailto:`), подписка Telegram, согласие ПДн (дата, версия).
- `Card` «Автомобиль»: `vehicle_label`, VIN (кнопка `Copy`), комментарий клиента.
- `Card` «Доставка»: способ, город, адрес/ПВЗ; поля `Input` «Трек-номер», `Input` «Заметка для курьера».
- `Card` «Позиции»: таблица с `specs` (mono) для сверки инженером.
- `Card` «Под заказ» (только preorder): `Input type="date"` «Ожидаем на складе», `Textarea` «Сообщение клиенту», кнопка `outline` «Сохранить и уведомить».
- `Card` «Платежи и возвраты»: таблицы.
- `Card` «История»: таймлайн `history`.
- `Textarea` «Заметка админа» (видна только админу), автосохранение по blur.

**Диалоги:**
- Переход в `shipped` → `Dialog` с обязательным трек-номером (СДЭК) или заметкой курьера, кнопка «Подтвердить отправку».
- Переход в `cancelled` (только из `pending_payment`) → `AlertDialog` «Отменить неоплаченный заказ?».
- Возврат → `Dialog` (US-008).

**Состояния:**
- **Loading:** `Skeleton` шапки и 4 карточек.
- **Empty:** не применяется.
- **Error:** 404 → «Заказ не найден» + «К списку»; ошибки действий → toast с `message` из ответа; `CONFLICT` → toast + автоматическая перезагрузка данных.

**Действия:** см. US-007, US-008. После любого успешного действия — повторный `GET /api/admin/orders/[id]`.

**Responsive:** desktop — 2 колонки (8/12 позиции, доставка, история; 4/12 клиент, авто, платежи); tablet/mobile — одна колонка, кнопки статусов — sticky-панель снизу.

---

### Экран: Админка — Товары

**Путь:** `/admin/products` | **Layout:** Admin

**Компоненты:** `Tabs` «Диски / Карбон», `Select` статуса, `Input` поиска, кнопка `default` «Добавить товар» (иконка `Plus`), `Table`: миниатюра 48×48, SKU (mono), Название, Статус (`Badge`), Наличие («3 из 4» = available из stock / «Под заказ»), Цена, Цена ателье, режим цены (`Badge` «Авто»/«Вручную»), меню действий (`DropdownMenu`, иконка `MoreHorizontal`: Редактировать, Открыть на сайте, В архив, Удалить).

**Состояния:**
- **Loading:** `Skeleton` 10 строк.
- **Empty:** «Товаров пока нет» + `default` «Добавить первый товар».
- **Error:** `Alert` + «Повторить».

**Действия:** «В архив» → `PATCH status=archived`; «Удалить» → `AlertDialog` «Удалить «Кованый моноблок M-01…»? Фото тоже удалятся» → `DELETE`; при 409 — toast «Товар есть в заказах. Переведите его в архив».

**Responsive:** desktop — полная таблица; tablet — скрыты «Цена ателье» и «Режим»; mobile — список `Card`.

---

### Экран: Админка — Форма товара

**Пути:** `/admin/products/new`, `/admin/products/[id]` | **Layout:** Admin

**Компоненты (`Form` + `productUpsertBody`):**
- `RadioGroup` «Тип»: Комплект дисков / Карбоновая деталь (на редактировании тип не меняется).
- «Основное»: Название, Производитель, Артикул (SKU), Адрес (slug, генерируется транслитерацией из названия при вводе, пока поле не правили вручную; кнопка `RefreshCw` «Сгенерировать»), Описание (`Textarea`, счётчик 5000).
- «Параметры диска» (только для дисков): Диаметр (`Select` 15–24), Ширина перед/зад (`Input type="number" step="0.5"`), Вылет перед/зад, PCD (`Select` из `5x112`, `5x120`, `5x130`, `5x108`, `5x114.3` + «Другое»), ЦО, Посадка крепежа (`Select`: Конус 60°, Сфера R13, Сфера R14, Плоская), `Checkbox` «Кольца в комплекте», `Checkbox` «Крепёж в комплекте», Конструкция, Покрытие, Вес одного диска. Под блоком — живой список «Подходит для: BMW 3 Series G20, BMW 5 Series G30, …» (клиентский расчёт по справочнику автомобилей по тем же правилам, что `find_wheels_for_vehicle`).
- «Совместимость» (только карбон): `Command`-список автомобилей с множественным выбором.
- «Наличие»: `RadioGroup` «Склад в Москве / Под заказ» (для карбона только «Под заказ»), Остаток (комплектов/шт.), Срок поставки от/до (дней).
- «Цена»: Валюта закупки (`Select` USD/CNY/RUB), Закупка (вводится в единицах валюты с копейками, хранится в минимальных единицах), `RadioGroup` «Авто по курсу ЦБ / Вручную», при «Авто» — строка расчёта «800.00 USD × 83,5600 × 2.00 = 133 696 ₽ → 133 700 ₽», при «Вручную» — поле «Цена, ₽»; «Цена для ателье, ₽» (необязательно).
- «Гарантия и сертификации»: Гарантия (мес.), чекбоксы TÜV / JWL / VIA / KBA, `Checkbox` «Заявления подтверждены поставщиком и производителем» с подсказкой «Без отметки сертификации не показываются на сайте».
- «Фото» (после первого сохранения): зона загрузки (drag & drop, `ImagePlus`), сетка превью с перетаскиванием порядка, поле alt, кнопка удаления (`Trash2`). До сохранения — текст «Сохраните черновик, чтобы добавить фото».
- Нижняя sticky-панель: `outline` «Сохранить черновик», `default` «Опубликовать» (на редактировании опубликованного — «Сохранить»).

**Состояния:**
- **Loading:** `Skeleton` формы; загрузка фото — превью с `Progress`.
- **Empty:** новая форма с пустыми полями и значениями по умолчанию (`warranty_months = 12`, `purchase_currency = USD`, `pricing_mode = auto`).
- **Error:** inline под полями; `SLUG_TAKEN` → inline + кнопка подставить `suggestion`; `RATE_NOT_LOADED` → inline в блоке «Цена» + кнопка «Загрузить курс»; `CONFLICT` → `AlertDialog` «Товар изменили в другой вкладке. Загрузить актуальную версию?» (ваши несохранённые изменения будут потеряны).
- Уход со страницы с несохранёнными изменениями → `beforeunload`-предупреждение.

**Действия:** сохранение → `POST` или `PATCH`; после создания — redirect на `/admin/products/[id]` с toast «Черновик сохранён. Добавьте фото».

**Responsive:** desktop — форма 8/12 + справа 4/12 превью карточки товара (как увидит покупатель); tablet/mobile — одна колонка, превью скрыто, кнопка «Предпросмотр» открывает `Sheet`.

---

### Экран: Админка — Автомобили

**Путь:** `/admin/vehicles` | **Layout:** Admin

**Компоненты:** `Select` марки, `Input` поиска по модели, `default` «Добавить авто» (`Plus`), `Table`: Марка, Модель, Поколение, Годы, PCD, ЦО, Посадка, R, J, ET, «Подходящих дисков» (число), `Switch` «Активен», меню (Редактировать, Удалить). Редактирование и создание — `Sheet side="right"` с формой `vehicleUpsertBody`.

**Состояния:**
- **Loading:** `Skeleton` 10 строк.
- **Empty:** «Справочник пуст. Выполните seed или добавьте автомобиль» + `default` «Добавить авто».
- **Error:** `Alert` + «Повторить»; ошибки формы — inline; дубликат — toast «BMW 7 Series G11 уже есть».

**Действия:** `Switch` → `PATCH is_active` (optimistic, откат при ошибке с toast); сохранение формы → toast «Сохранено. Подходящих дисков: 7».

**Responsive:** desktop — полная таблица; tablet — скрыты Посадка, J; mobile — список `Card`, `Sheet` на всю ширину.

---

### Экран: Админка — Ателье

**Путь:** `/admin/ateliers` | **Layout:** Admin

**Компоненты:** `Tabs` «На рассмотрении / Одобрены / Отклонены», `Table`: Название, ИНН (mono, ссылка «Проверить» на `https://egrul.nalog.ru/` в новой вкладке), Город, Контакт, Телефон, Email, Сайт, Дата, Заказов; кнопки `default` «Одобрить» (`Check`) и `outline` «Отклонить» (`X`) для pending.

**Диалоги:** «Отклонить» → `Dialog` с обязательной причиной (10–500 символов, клиент её увидит).

**Состояния:**
- **Loading:** `Skeleton` 5 строк.
- **Empty:** «Новых заявок нет» (иконка `Building2`).
- **Error:** `Alert` + «Повторить»; `CONFLICT` по ИНН → toast с текстом ответа.

**Действия:** см. US-009, шаг 6.

**Responsive:** desktop — таблица; tablet/mobile — `Card`-список, кнопки внизу карточки.

---

### Экран: Админка — Настройки

**Путь:** `/admin/settings` | **Layout:** Admin

**Компоненты:**
- `Card` «Курс ЦБ»: USD и CNY с датой, кнопка `outline` «Загрузить сейчас» (`RefreshCw`).
- `Card` «Цены»: `Input` «Множитель наценки» (по умолчанию 2.00 — «наценка 100%» из Идеи), `Select` «Округление» (1 / 10 / 100 / 1000 ₽), `Switch` «Пересчитывать автоматически после загрузки курса», `Input` «Порог изменения курса, %», кнопка `outline` «Сохранить».
- `Card` «Пересчёт цен»: кнопка `outline` «Показать изменения» (`dry_run: true`) → `Table` старая/новая цена → кнопка `default` «Применить» (`dry_run: false`).

**Состояния:**
- **Loading:** `Skeleton` трёх карточек.
- **Empty:** курса нет — «Курс ещё не загружался» + «Загрузить сейчас».
- **Error:** toast с `message`; ошибка ЦБ — inline в карточке курса.

**Действия:** см. выше; «Применить» → toast «Обновлено 18 цен».

**Responsive:** desktop — 2 колонки карточек; tablet/mobile — 1.

---
## БЛОК 5: Business Logic

### 5.1 Правила валидации форм

Все правила продублированы в Zod-схемах Блока 3 (клиент и сервер используют одну схему из `src/lib/schemas`). Нарушение на клиенте — inline-сообщение под полем, кнопка отправки не блокируется заранее (ошибки показываются при отправке и затем при каждом изменении поля). Нарушение на сервере — `400 VALIDATION_ERROR` с `details.fields`, клиент раскладывает ошибки по полям.

**Оформление заказа (`createOrderBody`):**

| Поле | Тип | Обязательно | Правило | Сообщение при нарушении |
|------|-----|-------------|---------|-------------------------|
| Имя и фамилия | string | да | trim, 2–100 символов | «Минимум 2 символа» |
| Телефон | string | да | после очистки от пробелов/скобок/дефисов и замены `8`/`7` на `+7`: `^\+7\d{10}$` | «Телефон в формате +7 999 123-45-67» |
| Email | string | да | trim, lower, ≤ 254, формат email | «Проверьте email» |
| Способ доставки | enum | да | `moscow_courier` \| `cdek_pvz` \| `cdek_door` | «Выберите способ доставки» |
| Город | string | да | 2–80; для курьера фиксировано «Москва» | «Укажите город» |
| Адрес | string | курьер, СДЭК до двери | 10–300 | «Укажите улицу, дом и квартиру» |
| Индекс | string | СДЭК до двери | `^\d{6}$` | «Индекс — 6 цифр» |
| Код ПВЗ СДЭК | string | СДЭК ПВЗ | upper, `^[A-Z0-9]{3,20}$` | «Код ПВЗ из 3–20 латинских букв и цифр» |
| VIN | string | нет | upper, `^[A-HJ-NPR-Z0-9]{17}$` | «VIN — 17 символов без I, O, Q» |
| Комментарий | string | нет | ≤ 1000 | «Не больше 1000 символов» |
| Согласие ПДн | boolean | да | `true` | «Нужно согласие на обработку персональных данных» |
| Согласие с офертой | boolean | да | `true` | «Нужно принять условия оферты» |

**Заявка ателье (`atelierApplyBody`):** название 2–120; ИНН `^(\d{10}|\d{12})$` + контрольная сумма (`isValidInn`); город 2–80; контактное лицо 2–100; телефон как выше; сайт — URL ≤ 200 или пусто; комментарий ≤ 1000.

**Аутентификация:** email как выше; пароль 8–72 символа, regex `^(?=.*[A-Za-zА-Яа-я])(?=.*\d).{8,72}$` («8–72 символа, минимум одна буква и одна цифра»); имя 2–100; повтор пароля совпадает с паролем («Пароли не совпадают»).

**Товар (`productUpsertBody`):** см. Блок 3. Дополнительно в UI: slug проверяется на уникальность при blur (`GET /api/admin/products?q=<slug>`), чтобы показать ошибку до отправки.

**Автомобиль (`vehicleUpsertBody`):** см. Блок 3.

### 5.2 Бизнес-правила

| # | Правило | Что происходит при нарушении |
|---|---------|------------------------------|
| BR-01 | Продажи только по России: доставка только в города РФ, телефон только `+7` | Телефон не `+7` — ошибка валидации; город за пределами РФ — заказ создаётся, инженер на шаге «Проверен» звонит клиенту и делает возврат (автоматической проверки города нет — справочника городов в MVP нет) |
| BR-02 | Оплата — только 100% предоплата картой или СБП через ЮKassa. Оплаты при получении нет | Нет пути создать заказ без платежа; заказ без оплаты отменяется через 30 минут |
| BR-03 | Один заказ = один тип (`stock` или `preorder`) | `MIXED_KINDS` (409), в UI — диалог при добавлении в корзину |
| BR-04 | Не больше 2 комплектов одного диска и 4 штук одной карбоновой детали в заказе; не больше 10 позиций | `QTY_LIMIT` / `TOO_MANY_LINES`; степпер в UI не даёт превысить |
| BR-05 | Товар `stock` можно заказать, только если `available_qty ≥ quantity` | `OUT_OF_STOCK` (409) |
| BR-06 | Бронь `stock`-товара — 30 минут с момента создания заказа | После истечения бронь перестаёт учитываться в `reserved_qty` немедленно (проверка `reserved_until > now()`), статус меняется на `cancelled` лениво (при открытии заказа) и в cron |
| BR-07 | Цена в заказе = цена из БД на момент создания заказа; клиентская цена используется только для сравнения | Расхождение → `PRICE_CHANGED` (409) |
| BR-08 | Наценка: розничная цена = закупка × курс ЦБ × `markup_multiplier` (по умолчанию 2.00 = наценка 100% из Идеи), округление вверх до 100 ₽ | — |
| BR-09 | Цена ателье ≤ розничной; если не задана — ателье платит розницу | Zod-ошибка «Цена ателье не может быть выше розничной» и CHECK в БД |
| BR-10 | Цены ателье видит и применяет только ателье со статусом `approved` | Для остальных `price_atelier` удаляется из ответов, заказ создаётся по рознице |
| BR-11 | Доставка бесплатна для всех способов (`delivery_price = 0`): по Идее доставка покрывается наценкой; бренд — «вместо скидки бесплатная доставка» | — |
| BR-12 | Заказ переходит в `paid` только по подтверждённому webhook ЮKassa (или по сверке, 5.9.1) — никогда по `return_url` | — |
| BR-13 | Сертификации товара показываются только при `claims_verified = true` (Идея: заявления только после подтверждения у поставщика и производителя) | Zod запрещает сохранить сертификации без отметки |
| BR-14 | Товар без фото нельзя опубликовать | `VALIDATION_ERROR` «Добавьте хотя бы одно фото» |
| BR-15 | Заказы не удаляются; неоплаченные — отменяются, оплаченные — возвращаются | Нет DELETE-эндпоинта и RLS-политики |
| BR-16 | Сумма возвратов по заказу ≤ сумма успешного платежа | `REFUND_EXCEEDS_PAID` (422) |
| BR-17 | Возврат товара на склад (`restock`) только для `kind = 'stock'` и только если заказ не был `delivered` | Галочка «Вернуть на склад» скрыта в остальных случаях |
| BR-18 | Не больше 3 неоплаченных заказов с действующей бронью на один email | `RATE_LIMITED` «У вас уже есть неоплаченные заказы. Оплатите или дождитесь отмены через 30 минут» |
| BR-19 | Отменить (`cancelled`) можно только заказ в `pending_payment`; оплаченный — только возвратом | `INVALID_STATUS_TRANSITION` |
| BR-20 | Функция «Опт для ателье» включается флагом `FEATURE_ATELIER` | При `false` — 404 на `/atelier`, `/admin/ateliers`, `FEATURE_DISABLED` в API, цены ателье не применяются |

### 5.3 Статусы заказа и переходы

| Статус | Подпись для покупателя | Для какого `kind` | Кто переводит |
|--------|------------------------|-------------------|---------------|
| `pending_payment` | Ожидает оплаты | оба | система при создании |
| `paid` | Оплачен | оба | webhook ЮKassa / сверка |
| `confirmed` | Проверен инженером | stock | admin |
| `ordered_from_supplier` | Заказан у поставщика | preorder | admin |
| `in_transit` | Едет в Москву | preorder | admin |
| `arrived` | Прибыл на склад | preorder | admin |
| `shipped` | Передан в доставку | оба | admin (обязателен трек СДЭК или заметка курьера) |
| `delivered` | Доставлен | оба | admin |
| `cancelled` | Отменён | оба | cron / ленивая отмена / admin (только из `pending_payment`) |
| `refunded` | Деньги возвращены | оба | система после успешного полного возврата |

Допустимые переходы — `src/lib/order-status.ts`:

```ts
export const TRANSITIONS: Record<"stock" | "preorder", Record<string, string[]>> = {
  stock: {
    pending_payment: ["cancelled"],          // paid — только webhook
    paid: ["confirmed"],
    confirmed: ["shipped"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: [],
    refunded: [],
  },
  preorder: {
    pending_payment: ["cancelled"],
    paid: ["ordered_from_supplier"],
    ordered_from_supplier: ["in_transit"],
    in_transit: ["arrived"],
    arrived: ["shipped"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: [],
    refunded: [],
  },
};
// refunded достигается только из refund-обработчика из любого статуса после paid.
export const allowedTransitions = (kind: "stock" | "preorder", status: string) => TRANSITIONS[kind][status] ?? [];
```

Каждый переход: запись в `order_status_history`, уведомление покупателя (`customer_status_changed`, кроме перехода в `cancelled` по истечении брони — по нему письма нет), обновление дат (`shipped_at`, `delivered_at`).

Ожидаемая доставка (показывается после `shipped`): `shipped_at` (дата МСК) + `MOSCOW_DELIVERY_DAYS` для `moscow_courier` или `REGION_DELIVERY_DAYS` для СДЭК, в рабочих днях (суббота и воскресенье пропускаются; праздники не учитываются — показывается диапазон «4–7 октября»).

### 5.4 Ценообразование

`src/lib/pricing.ts`:

```ts
/**
 * purchaseCostMinor — закупка в минимальных единицах валюты (80000 = $800.00)
 * rate — рублей за 1 единицу валюты (83.56); для RUB = 1
 * Возвращает цену в копейках, округлённую ВВЕРХ до roundingRub рублей.
 * Пример: 80000, 83.56, 2.00, 100 → 800 × 83.56 × 2 = 133 696 ₽ → 133 700 ₽ → 13370000
 */
export function computeAutoPrice(purchaseCostMinor: number, rate: number, multiplier: number, roundingRub: number): number {
  const rub = (purchaseCostMinor / 100) * rate * multiplier;
  const rounded = Math.ceil(Math.round(rub * 100) / 100 / roundingRub) * roundingRub;
  return rounded * 100;
}
```

- Курс для расчёта — последняя строка `exchange_rates` по валюте (`order by rate_date desc limit 1`).
- `pricing_mode = 'manual'` — цена задаётся админом и пересчётом не трогается.
- Автопересчёт (cron, шаг 2): если `app_settings.auto_reprice = true` и курс изменился на `≥ reprice_threshold` % относительно курса, по которому считалась текущая цена (берётся курс на дату `price_updated_at`), — пересчитать все `auto`-товары этой валюты, обновить `price_updated_at`. Порог 2% выбран, чтобы цены не «прыгали» ежедневно на десятки рублей (премиальный бренд), но и не отставали от курса больше, чем на 2% маржи.
- Уже созданные заказы цену не меняют (снапшот в `order_items`).
- Экономика (из Идеи, для справки инженеру): закупка $800 → ~66 800 ₽ → цена 133 700 ₽ → эквайринг ~2% ≈ 2 700 ₽ → остаток ~64 200 ₽ до доставки, пошлин и налогов.

### 5.5 Подбор по авто

Правила совместимости диска и автомобиля (функция `find_wheels_for_vehicle`, дублируется на клиенте в форме товара для превью):

1. PCD совпадает строго (`5x112` = `5x112`).
2. Диаметр в диапазоне автомобиля.
3. Ширина передних и задних дисков в диапазоне.
4. Вылет передних и задних дисков в диапазоне.
5. ЦО диска ≥ ЦО автомобиля. Разница ≤ 0.2 мм — совпадение (Audi 66.5 / BMW, Mercedes 66.6). Разница > 0.2 мм — только если `includes_hub_rings = true`, тогда в карточке «Центровочные кольца в комплекте».
6. Посадка крепежа совпадает, либо в комплекте свой крепёж (`includes_fasteners = true`).

Финальная проверка — инженер на шаге `paid → confirmed` (по VIN и автомобилю из заказа). Автоматический подбор отсекает ошибки размера, инженер отвечает за редкие случаи (тормозные системы большого диаметра, нештатные подвески).

Выбор года: `GET /api/vehicles/resolve` возвращает все поколения, у которых `year_from ≤ year ≤ coalesce(year_to, текущий год)`. Если их несколько — выбор поколения обязателен.

### 5.6 Доставка

| Способ | Город | Срок | Цена | Как оформляет админ |
|--------|-------|------|------|---------------------|
| Курьер по Москве | Только Москва | 1–2 рабочих дня после `confirmed` | 0 ₽ | Своим курьером/Яндекс Доставкой; в `courier_note` — «Курьер Сергей, +7 999 000-11-22, 14:00–18:00» |
| СДЭК — пункт выдачи | Любой город РФ | 2–5 рабочих дней | 0 ₽ | Создаёт отправление в личном кабинете СДЭК вручную, объявленная стоимость = сумма заказа (страховка), вводит трек |
| СДЭК — до двери | Любой город РФ | 2–5 рабочих дней | 0 ₽ | То же |

Интеграции с API СДЭК в MVP нет: при 10–15 заказах в месяц ручное оформление занимает 5 минут на заказ, а интеграция съела бы 6–8 часов из 35–42. Ссылка на трекинг: `https://www.cdek.ru/ru/tracking?order_id=<tracking_number>`.

### 5.7 Аутентификация (ателье и админ)

**Настройки Supabase (Dashboard, один раз):**
1. Authentication → URL Configuration: Site URL = `NEXT_PUBLIC_SITE_URL`; Redirect URLs: `<SITE_URL>/auth/callback`, `http://localhost:3000/auth/callback`.
2. Authentication → Providers → Email: Confirm email = ON; Secure password change = ON; минимальная длина пароля 8.
3. Authentication → SMTP Settings: Enable custom SMTP = ON; Host `smtp.yandex.ru`, Port `465`, User = `SMTP_USER`, Password = `SMTP_PASSWORD`, Sender email = `SMTP_USER`, Sender name `ForgeCarbon`. (Встроенная почта Supabase отправляет письма только адресам участников проекта, поэтому без своего SMTP ателье не получат письмо подтверждения.)
4. Authentication → Email Templates: шаблоны на русском — «Подтвердите email», «Сброс пароля» (тексты в `supabase/email-templates/*.html`, ссылка `{{ .ConfirmationURL }}`).

**Регистрация:**
1. `/auth/register` → `supabase.auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: SITE_URL + "/auth/callback?next=" + encodeURIComponent(next ?? "/account") } })`.
2. Триггер `on_auth_user_created` создаёт `profiles` с `role = 'customer'`.
3. Экран «Проверьте почту».
4. Клик по ссылке → `/auth/callback?code=...&next=/atelier` → `supabase.auth.exchangeCodeForSession(code)` → redirect на `next` (если `next` начинается с `/` и не с `//`, иначе `/account`).
5. Ошибка обмена кода → redirect `/auth/login?error=link_expired` → inline «Ссылка устарела. Войдите, мы отправим новую».

**Вход:**
1. `supabase.auth.signInWithPassword({ email, password })`.
2. Ошибка `Invalid login credentials` → «Неверный email или пароль»; `Email not confirmed` → предложение отправить письмо повторно.
3. Успех → `router.refresh()` → redirect на `next` или `/account` (admin → `/admin`).

**Сессия:** `@supabase/ssr` хранит сессию в cookies; `src/proxy.ts` обновляет её на каждом запросе к `/account`, `/admin`, `/atelier`, `/checkout`, `/api/*` (кроме `/api/webhooks/*` и `/api/cron/*`). На сервере пользователь всегда определяется через `supabase.auth.getUser()` (проверка токена на сервере Supabase), не через `getSession()`.

**Восстановление пароля:** US-011.

**Выход:** `supabase.auth.signOut()` → `/`.

**Создание админа:** SQL из Блока 2 (2.17). Роль `admin` через интерфейс не выдаётся.

### 5.8 Аналитика: активация и конверсия

Идея оставила активацию и конверсию на этап Чертежа. Решение:

| Метрика | Определение | Цель на первый месяц | Обоснование |
|---------|-------------|----------------------|-------------|
| Заказы | Оплаченные заказы (`paid_at` в месяце) | 10–15 | Из Идеи |
| Активация | Доля визитов с целью `fitment_selected`, в которых затем есть `product_view` | ≥ 40% | Человек, выбравший авто и открывший подходящий диск, получил ценность продукта («вижу, что подходит и есть в Москве») |
| Конверсия | Оплаченные заказы / визиты с `fitment_selected` | ≥ 1% | При 1% для 10–15 заказов нужно 1 000–1 500 визитов с подбором в месяц — это и есть цель по трафику |
| Возврат | Доля покупателей, вернувшихся за карбоном/аксессуарами, + повторные заказы ателье через 30 дней | — (замер) | Из Идеи; считается SQL-запросом по `customer_email` и `atelier_id` |

Цели Яндекс Метрики (вызов `ym(COUNTER_ID, 'reachGoal', '<goal>')` из `src/lib/analytics.ts`, который ничего не делает, если счётчик не задан): `fitment_selected`, `product_view`, `add_to_cart`, `checkout_started`, `payment_succeeded`, `telegram_subscribed`, `atelier_applied`. Вебвизор выключен (персональные данные в формах). Счётчик подключается скриптом `https://mc.yandex.ru/metrika/tag.js` через `next/script strategy="afterInteractive"`.

### 5.9 Внешние интеграции

#### 5.9.1 ЮKassa

- **Тип:** REST API v3 + HTTP-уведомления (webhook).
- **Аутентификация:** HTTP Basic `YOOKASSA_SHOP_ID:YOOKASSA_SECRET_KEY`.
- **Что отправляем (создание платежа):**

`src/lib/yookassa.ts`:

```ts
import "server-only";
import { env } from "@/lib/env";
import { kopecksToRubString } from "@/lib/money";

const API = "https://api.yookassa.ru/v3";
const auth = "Basic " + Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString("base64");
// 1 = без НДС (ИП на УСН). При другой системе налогообложения бухгалтер называет код, константа меняется здесь.
export const YOOKASSA_VAT_CODE = 1;

type Item = { title: string; quantity: number; unit_price: number };

async function call<T>(method: "GET" | "POST", path: string, idempotenceKey?: string, body?: unknown): Promise<T> {
  const delays = [0, 1000, 3000]; // до 3 попыток при сетевой ошибке и 5xx; ключ идемпотентности тот же
  let lastError: unknown;
  for (const d of delays) {
    if (d) await new Promise((r) => setTimeout(r, d));
    try {
      const res = await fetch(API + path, {
        method,
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
          ...(idempotenceKey ? { "Idempotence-Key": idempotenceKey } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
      if (res.status >= 500) { lastError = new Error(`YooKassa ${res.status}`); continue; }
      const json = await res.json();
      if (!res.ok) throw Object.assign(new Error(json.description ?? "YooKassa error"), { yookassa: json, status: res.status });
      return json as T;
    } catch (e: any) {
      if (e?.yookassa) throw e;          // 4xx — не повторяем
      lastError = e;
    }
  }
  throw lastError;
}

export function createPayment(p: {
  orderId: string; orderNumber: string; amount: number; email: string; phone: string;
  items: Item[]; returnUrl: string; attempt: number;
}) {
  return call<{ id: string; status: string; confirmation: { confirmation_url: string } }>(
    "POST", "/payments", `order_${p.orderId}_${p.attempt}`,
    {
      amount: { value: kopecksToRubString(p.amount), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: p.returnUrl },
      description: `Заказ ${p.orderNumber}`,
      metadata: { order_id: p.orderId, order_number: p.orderNumber },
      receipt: {
        customer: { email: p.email, phone: p.phone.replace("+", "") },
        items: p.items.map((i) => ({
          description: i.title.slice(0, 128),
          quantity: i.quantity,
          amount: { value: kopecksToRubString(i.unit_price), currency: "RUB" },
          vat_code: YOOKASSA_VAT_CODE,
          payment_mode: "full_prepayment",
          payment_subject: "commodity",
        })),
      },
    },
  );
}

export const getPayment = (id: string) => call<any>("GET", `/payments/${id}`);
export const getRefund = (id: string) => call<any>("GET", `/refunds/${id}`);
export const createRefund = (p: { refundId: string; paymentId: string; amount: number; description: string; receipt: unknown }) =>
  call<any>("POST", "/refunds", `refund_${p.refundId}`, {
    payment_id: p.paymentId,
    amount: { value: kopecksToRubString(p.amount), currency: "RUB" },
    description: p.description,
    receipt: p.receipt,
  });
```

`returnUrl` = `${NEXT_PUBLIC_SITE_URL}/orders/${number}?t=${token}&from=payment`. Номер попытки `attempt` = количество строк `payments` по заказу + 1.

- **Что получаем:** `id`, `status` (`pending`), `confirmation.confirmation_url`. Webhook-события: `payment.succeeded`, `payment.canceled`, `refund.succeeded`.
- **Способы оплаты:** не передаём `payment_method_data` — ЮKassa показывает на своей странице все включённые в магазине способы; в личном кабинете ЮKassa включаются только «Банковские карты» и «СБП».
- **Retry:** 3 попытки (0 / 1 / 3 с) при сетевых ошибках и 5xx с тем же `Idempotence-Key`; 4xx не повторяются.
- **Fallback:**
  - Создание платежа не удалось → заказ сохранён в `pending_payment`, ответ 502 с `order_url`; на странице заказа кнопка «Оплатить» создаёт новый платёж (`attempt + 1`). Ошибка 4xx (например, неверный чек) → дополнительно Telegram админу `admin_attention`: «Ошибка создания платежа FC-26-000123: <description>».
  - Webhook не дошёл → **сверка**: при каждом `GET /api/orders/[number]` для заказа в `pending_payment`, у которого есть платёж `pending` и последняя проверка была больше 60 с назад (поле `payments.updated_at`), сервер вызывает `getPayment`; если `succeeded` — тот же путь, что в webhook (`mark_order_paid` + уведомления). Плюс cron раз в сутки проверяет все платежи `pending` младше 48 часов.
  - ЮKassa недоступна при возврате → `refunds.status = 'failed'`, админ повторяет позже.

#### 5.9.2 Telegram Bot API

- **Тип:** REST (`https://api.telegram.org/bot<TOKEN>/<method>`) + webhook входящих сообщений.
- **Что отправляем:** `sendMessage` с `chat_id`, `text`, `parse_mode: "HTML"`, `link_preview_options: { is_disabled: true }`; `forwardMessage` — пересылка вопросов клиентов админу. Все подставляемые значения экранируются `escapeHtml` (`&`, `<`, `>`, `"`).
- **Что получаем:** `{ ok: true, result: Message }` или `{ ok: false, error_code, description, parameters?: { retry_after } }`.
- **Retry:** 3 попытки с паузами 0.5 / 1 / 2 с, таймаут 5 с; при `429` — пауза `retry_after` секунд (если ≤ 5), иначе в очередь. `403` (бот заблокирован пользователем) — не повторять, обнулить `orders.telegram_chat_id`.
- **Fallback:** после неудачи — запись в `notification_queue` (`next_attempt_at = now() + 5 мин`, далее 30 мин, 2 ч, 12 ч; после 5 попыток — `failed`). Очередь разбирают cron и `GET /api/admin/summary`. Пропущенное уведомление админу не теряет заказ: все заказы видны в `/admin/orders`.

Тексты сообщений (`src/lib/notifications/templates.ts`):

| Шаблон | Кому | Текст |
|--------|------|-------|
| `admin_order_paid` | админ | `💳 Оплачен заказ <b>FC-26-000123</b> · 133 700 ₽\nКованый моноблок M-01 R20 ×1\nBMW 5 Series G30 · VIN WBAJA11050B123456\nКазань · СДЭК ПВЗ KZN45\n<a href="https://forgecarbon.vercel.app/admin/orders/4b9e…">Открыть заказ</a>` |
| `admin_attention` | админ | `⚠️ Заказ <b>FC-26-000123</b> требует внимания: Оплачен после истечения брони; Не хватило остатка` |
| `admin_atelier_applied` | админ | `🏁 Новая заявка ателье: Garage 77, ИНН 7801234567, Санкт-Петербург` |
| `customer_order_paid` | покупатель (email) | Тема «Заказ FC-26-000123 оплачен». Текст: состав, сумма, способ доставки, «Инженер проверит совместимость и передаст заказ в доставку», кнопка-ссылка «Статус заказа» |
| `customer_status_changed` | покупатель (email + Telegram) | `Заказ FC-26-000123: Передан в доставку. Трек СДЭК: 1234567890` (трек — только для `shipped`) |
| `customer_refund` | покупатель (email + Telegram) | `По заказу FC-26-000123 оформлен возврат 133 700 ₽. Срок зачисления зависит от банка, обычно до 10 рабочих дней` |
| `atelier_approved` | ателье (email) | «Заявка Garage 77 одобрена. Цены для ателье доступны после входа на сайт» |
| `atelier_rejected` | ателье (email) | «Заявка Garage 77 отклонена. Причина: <rejection_reason>. Вы можете подать её повторно» |

#### 5.9.3 Почта (SMTP Яндекса)

- **Тип:** SMTP, `nodemailer.createTransport({ host: "smtp.yandex.ru", port: 465, secure: true, auth: { user, pass }, connectionTimeout: 10000 })`.
- **Что отправляем:** HTML + текстовая версия, `from: "ForgeCarbon <SMTP_USER>"`, `replyTo: SMTP_USER`. Шаблоны — функции в `src/lib/notifications/email.ts`, все значения экранируются. Вёрстка — таблицы, тёмный фон `#0A0A0B`, текст `#F2F2F3`, кнопка `#E6FF00`.
- **Что получаем:** `info.messageId` или исключение.
- **Retry:** 2 попытки (0 / 2 с).
- **Fallback:** `notification_queue` (как Telegram). Покупатель в любом случае попадает на страницу заказа по `return_url` и видит статус; ссылку стоит сохранить — об этом надпись на странице «Сохраните эту ссылку — по ней всегда виден статус заказа».

#### 5.9.4 Курсы ЦБ РФ

- **Тип:** HTTP GET `https://www.cbr.ru/scripts/XML_daily.asp`, ответ — XML в кодировке windows-1251.
- **Что получаем и как парсим** (`src/lib/cbr.ts`):

```ts
export async function fetchCbrRates(): Promise<{ date: string; USD: number; CNY: number }> {
  const res = await fetch("https://www.cbr.ru/scripts/XML_daily.asp", { signal: AbortSignal.timeout(10000), cache: "no-store" });
  if (!res.ok) throw new Error(`CBR HTTP ${res.status}`);
  const xml = new TextDecoder("windows-1251").decode(await res.arrayBuffer());
  const dateMatch = xml.match(/<ValCurs[^>]*Date="(\d{2})\.(\d{2})\.(\d{4})"/);
  if (!dateMatch) throw new Error("CBR: no date");
  const pick = (code: string) => {
    const m = xml.match(new RegExp(`<CharCode>${code}</CharCode>\\s*<Nominal>(\\d+)</Nominal>\\s*<Name>[^<]*</Name>\\s*<Value>([\\d,]+)</Value>`));
    if (!m) throw new Error(`CBR: no ${code}`);
    return Number(m[2].replace(",", ".")) / Number(m[1]);
  };
  return { date: `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`, USD: pick("USD"), CNY: pick("CNY") };
}
```

- **Retry:** 3 попытки (0 / 2 / 5 с).
- **Fallback:** остаётся предыдущий курс; цены не меняются. Если последний курс старше 3 дней — `Alert` в `/admin` и Telegram админу один раз в сутки «Курс ЦБ не обновлялся с 01.10.2026». Запись курса — `insert ... on conflict (currency, rate_date) do nothing` (повтор в один день безопасен; в выходные ЦБ отдаёт курс с датой следующего рабочего дня).

#### 5.9.5 Supabase Storage

- **Что отправляем:** файлы фото. Перед загрузкой браузер сжимает фото: `createImageBitmap` → `canvas` с длинной стороной 1600px → `canvas.toBlob(cb, "image/webp", 0.85)`; файл больше 5 МБ после сжатия отклоняется.
- **Отдача:** публичные URL бакета; в `next.config.ts` `images: { unoptimized: true }` — фото уже оптимизированы при загрузке, и лимит оптимизации изображений бесплатного тарифа Vercel не расходуется.
- **Fallback:** ошибка загрузки → toast «Не удалось загрузить фото. Повторить» на превью; запись в `product_images` создаётся только после успешной загрузки файла; если insert упал после загрузки — файл удаляется.

### 5.10 Безопасность

- **Аутентификация:** Supabase Auth email+пароль, сессия в httpOnly cookies (`@supabase/ssr`).
- **Авторизация:** RLS на всех таблицах (Блок 2) + проверка роли в каждом `/api/admin/*` и в layout `/admin`. Service-role клиент (`src/lib/supabase/admin.ts`) начинается с `import "server-only"` и используется только в: публичном чтении каталога, `create_order`, `mark_order_paid`, webhook'ах, cron, смене роли при одобрении ателье.
- **CORS:** API рассчитан только на свой фронтенд. Заголовки `Access-Control-Allow-*` не выставляются нигде (браузеры блокируют чужие origin). Для мутирующих публичных и пользовательских эндпоинтов (`POST/PATCH/PUT/DELETE` кроме `/api/webhooks/*`, `/api/cron/*`) проверяется заголовок `Origin`: он должен совпадать с `new URL(NEXT_PUBLIC_SITE_URL).origin` (в dev — `http://localhost:3000`), иначе `403 FORBIDDEN` (защита от CSRF).
- **Rate limiting** (`check_rate_limit`, ключ — IP из `x-forwarded-for` или `user.id`):

| Эндпоинт | Лимит | Окно |
|----------|-------|------|
| `POST /api/orders` | 5 на IP | 600 с |
| `POST /api/orders/[number]/pay` | 10 на заказ | 600 с |
| `GET /api/orders/[number]` | 30 на IP | 60 с |
| `POST /api/cart/validate` | 60 на IP | 60 с |
| `GET /api/products`, `/api/vehicles/*` | 120 на IP | 60 с |
| `POST /api/ateliers` | 3 на пользователя | 3600 с |
| `/api/admin/*` | 300 на пользователя | 60 с |
| Supabase Auth | встроенные лимиты Supabase | — |

Превышение → `429 RATE_LIMITED` с заголовком `Retry-After`.

- **Input sanitization:** все входы через Zod (длины, regex); React экранирует вывод; `dangerouslySetInnerHTML` запрещён (кроме MDX статичных страниц, которые пишет владелец); пользовательский текст (описание, комментарии) выводится с `whitespace-pre-line`, без HTML; в Telegram и email все значения через `escapeHtml`; SQL — только через supabase-js/RPC с параметрами.
- **Секреты:** только в env Vercel; `NEXT_PUBLIC_*` содержат только публичные значения; `.env*` в `.gitignore`.
- **Заголовки** (`next.config.ts` → `headers()` для `/(.*)`): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`.
- **Открытый редирект:** параметр `next` принимается только если начинается с `/` и не с `//`.
- **Токен заказа:** 24 случайных байта (`crypto.randomBytes`) → base64url (32 символа); в БД — SHA-256; сравнение `timingSafeEqual`; неверный токен и несуществующий заказ дают одинаковый 404.

### 5.11 Персональные данные (152-ФЗ)

Решения (в Идее: «согласие обязательно, проверить уведомление Роскомнадзора»):
1. Согласие на обработку ПДн — отдельный обязательный чекбокс (не объединён с офертой), в заказе хранятся `consent_pd_at` и `consent_policy_version`.
2. Политика обработки ПДн опубликована на `/privacy` и доступна со всех страниц (подвал).
3. Уведомление в Роскомнадзор об обработке ПДн подаётся владельцем через портал `pd.rkn.gov.ru` **до запуска** — это действие вне кода, оно включено в чек-лист запуска (Приложение B).
4. Минимизация: собираются только имя, телефон, email, адрес, VIN; паспортные данные и дата рождения не собираются.
5. Вебвизор Метрики выключен.
6. Срок хранения — 3 года после исполнения заказа; удаление по запросу субъекта — админ вручную обезличивает заказ SQL-запросом (`customer_name = 'Удалено'`, телефон `+70000000000`, email `deleted+<number>@forgecarbon.invalid`, адрес/VIN — `null`), оплата и состав сохраняются для учёта.

### 5.12 Cron-задачи

Одна ежедневная задача (бесплатный тариф Vercel запускает cron не чаще раза в сутки): `GET /api/cron/daily`, расписание `0 6 * * *` UTC = 09:00 МСК. Шаги независимы: ошибка одного не останавливает остальные, итог возвращается в ответе и пишется в лог.

| Шаг | Что делает | Ошибка |
|-----|-----------|--------|
| 1. Курсы | `fetchCbrRates()` → insert USD и CNY | Лог + флаг для шага 6; цены не трогаются |
| 2. Пересчёт цен | Если курс изменился ≥ порога и `auto_reprice` — пересчёт `auto`-товаров (5.4) | Лог; цены остаются прежними |
| 3. Отмена броней | `rpc("cancel_expired_orders")` | Лог; брони и так не учитываются после истечения |
| 4. Сверка платежей | Для `payments.status = 'pending'` младше 48 ч — `getPayment`, при `succeeded` — `mark_order_paid` + уведомления | Лог, повтор завтра и при открытии заказа |
| 5. Очередь уведомлений | До 50 записей `pending` с `next_attempt_at ≤ now()` | Попытки и `last_error` в строке |
| 6. Уборка и алерты | Удалить `rate_limit_hits` старше 1 суток; если курс старше 3 дней — Telegram админу | Лог |

Ежедневный запрос к БД также не даёт бесплатному проекту Supabase «уснуть» из-за неактивности.

---

## БЛОК 6: Edge Cases

### Сеть и доступность

| # | Ситуация | Триггер | Поведение системы |
|---|----------|---------|-------------------|
| 1 | Пропала сеть при оформлении | `fetch` на `POST /api/orders` падает с `TypeError` | Toast «Нет соединения. Данные формы сохранены»; форма в `sessionStorage`; повтор отправки идёт с тем же `client_request_id` — если заказ успел создаться, вернётся он же, дубля не будет |
| 2 | ЮKassa не отвечает при создании платежа | 3 попытки по 15 с исчерпаны | Заказ остаётся `pending_payment` с бронью; 502 + `AlertDialog` со ссылкой на заказ; там кнопка «Оплатить» |
| 3 | Покупатель оплатил и закрыл вкладку до возврата на сайт | Нет перехода на `return_url` | Webhook переводит заказ в `paid`, письмо со ссылкой уходит на email; ничего не теряется |
| 4 | Webhook ЮKassa не дошёл (наш сервер отдал 500 / Vercel недоступен) | Платёж `succeeded`, заказ `pending_payment` | ЮKassa повторяет уведомления; сверка при открытии страницы заказа и в cron (5.9.1) переводит заказ в `paid` |
| 5 | Медленный мобильный интернет | Загрузка каталога > 3 с | Skeleton-карточки сразу; фото ≤ 1600px WebP с `loading="lazy"` вне первого экрана; серверный рендеринг каталога даёт текст до загрузки JS |
| 6 | Supabase недоступен | Любой запрос к БД падает | Каталог — `error.tsx` «Что-то пошло не так» + «Повторить»; checkout — toast «Сервис временно недоступен, попробуйте через несколько минут», корзина в `localStorage` сохраняется |
| 7 | Telegram API недоступен | 3 неудачные попытки `sendMessage` | Запись в `notification_queue`, отправка позже (cron, открытие `/admin`); заказ виден в админке независимо от уведомления |
| 8 | SMTP Яндекса отклонил письмо | Ошибка nodemailer | Очередь уведомлений; покупатель видит заказ по `return_url`; на странице подсказка сохранить ссылку |
| 9 | Сайт ЦБ недоступен | Шаг 1 cron упал | Используется предыдущий курс; через 3 дня — алерт админу и баннер в `/admin` |

### Данные и состояние

| # | Ситуация | Триггер | Поведение системы |
|---|----------|---------|-------------------|
| 10 | Два покупателя одновременно берут последний комплект | Два `create_order` почти одновременно | `SELECT ... FOR UPDATE` сериализует транзакции; второй получает `OUT_OF_STOCK`, у него в корзине позиция помечается «Нет в наличии» |
| 11 | Оплата пришла после истечения брони, а комплект уже купил другой | `mark_order_paid` для `cancelled` заказа, `stock_qty` не хватает | Заказ → `paid` с `needs_attention = true`, причина «Оплачен после истечения брони; Не хватило остатка»; Telegram админу; админ звонит клиенту и предлагает другой диск или полный возврат |
| 12 | Цена изменилась, пока товар лежал в корзине | Пересчёт по курсу | `POST /api/cart/validate` показывает новые цены при открытии корзины; при оформлении — `PRICE_CHANGED` и диалог подтверждения |
| 13 | Товар сняли с продажи, а он лежит в корзинах | `status = archived` | Validate возвращает `problem = "unavailable"`, позиция затемнена, оформление заблокировано до удаления |
| 14 | Админ редактирует товар в двух вкладках | PATCH с устаревшим `updated_at` | `409 CONFLICT`, диалог «Загрузить актуальную версию?»; данные второй вкладки не затирают первую |
| 15 | Сумма платежа не совпадает с суммой заказа | Подмена или ошибка в метаданных | Заказ → `paid` с `needs_attention` и причиной; админ решает вручную (доплата или возврат) |
| 16 | Повторный webhook об одном и том же платеже | ЮKassa повторила уведомление | `mark_order_paid` возвращает `already_paid`, уведомления повторно не отправляются (отправка только при ответе `paid`/`paid_needs_attention`) |
| 17 | `localStorage` недоступен или повреждён | Приватный режим, ручная правка, JSON не парсится | Все чтения в `try/catch`; при ошибке корзина и авто считаются пустыми и перезаписываются; без `localStorage` корзина живёт в памяти вкладки, показывается toast «Корзина не сохранится после закрытия вкладки» |
| 18 | Сохранённый автомобиль удалён или скрыт админом | `GET /api/vehicles/[id]` = 404 | Очистка `fc_vehicle`, каталог без фильтра, toast «Автомобиль не найден, показаны все диски» |
| 19 | На выбранный год приходится два поколения | BMW 5 Series, 2017 | Появляется обязательный выбор поколения (F10 / G30) — подбор без него не запускается |
| 20 | Сессия ателье истекла во время оформления | `getUser()` вернул null | Заказ считается розничным → `PRICE_CHANGED` с розничной суммой → диалог с кнопкой «Войти» |
| 21 | Заказ под заказ задерживается у поставщика | Поставщик сдвинул отгрузку | Админ меняет `expected_ready_at` и `customer_visible_note` → покупатель получает письмо и Telegram, на странице заказа новая дата и причина |

### Безопасность

| # | Ситуация | Триггер | Поведение системы |
|---|----------|---------|-------------------|
| 22 | Перебор номеров заказов | Запросы `/orders/FC-26-000124`, `…125` без токена | Одинаковый 404 для «нет заказа» и «неверный токен»; 30 запросов/мин на IP; токен 192 бита — перебор невозможен |
| 23 | Подмена ID: покупатель зовёт `/api/admin/*` | Прямой запрос с сессией customer | `403 FORBIDDEN`; RLS дополнительно не даёт изменить данные даже при ошибке в коде |
| 24 | Прямой запрос к Supabase с anon-ключом из браузера | `from('products').select('purchase_cost')` | RLS `products_select_admin` → 0 строк; закупочные цены и цены ателье не утекают |
| 25 | XSS в комментарии или имени | `<script>alert(1)</script>` в поле комментария | В интерфейсе выводится как текст (React); в Telegram/email экранируется `escapeHtml` |
| 26 | Поддельный webhook ЮKassa | POST с выдуманным `payment.succeeded` | IP не из списка ЮKassa → 403; даже с верным IP статус берётся только из `GET /v3/payments/{id}` |
| 27 | Блокировка остатков ботом | Много заказов без оплаты, чтобы держать бронь | 5 заказов/10 мин на IP, 3 неоплаченных заказа на email; бронь сгорает через 30 минут |
| 28 | Открытый редирект после входа | `/auth/login?next=https://evil.example` | `next` отбрасывается, redirect на `/account` |
| 29 | Пользователь пытается назначить себе роль admin | `update profiles set role='admin'` через anon-клиент | Колоночные права разрешают обновлять только `full_name`, `phone` → ошибка `permission denied` |

### Лимиты и производительность

| # | Ситуация | Триггер | Поведение системы |
|---|----------|---------|-------------------|
| 30 | Админ загружает фото 25 МБ с камеры | Выбор файла | Браузер сжимает до 1600px WebP; если результат > 5 МБ — ошибка «Файл больше 5 МБ»; бакет дополнительно режет по `file_size_limit` |
| 31 | Девятое фото товара | Загрузка при 8 фото | Триггер БД → `IMAGES_LIMIT`, toast «У товара уже 8 фото» |
| 32 | Очень длинное описание или комментарий | > 5000 / > 1000 символов | Zod и CHECK отклоняют; счётчик символов в поле |
| 33 | 10 000+ заказов через несколько лет | Список заказов в админке | Пагинация по 20, индекс `(status, created_at desc)`; поиск по номеру — по уникальному индексу |
| 34 | Лимиты бесплатных тарифов | Supabase 500 МБ БД / 1 ГБ Storage, Vercel Hobby | Фото ~200–400 КБ → 1 ГБ хватает на ~2 500 фото; заказы — килобайты; оптимизация изображений Vercel отключена; при приближении к лимиту Supabase присылает письмо — переход на платный тариф |
| 35 | Ограничение суммы платежа у банка покупателя | Комплект за 400 000 ₽ отклонён банком | Платёж `canceled` с причиной; на странице заказа «Банк отклонил платёж. Попробуйте СБП или другую карту» + кнопка «Оплатить» |

### Платежи

| # | Ситуация | Триггер | Поведение системы |
|---|----------|---------|-------------------|
| 36 | Двойная оплата одного заказа | Покупатель открыл оплату в двух вкладках и оплатил обе | Второй `payment.succeeded` → `mark_order_paid` = `already_paid`, но платёж succeeded → сервер автоматически создаёт полный возврат второго платежа (`refund` с причиной «Повторная оплата») и пишет админу `admin_attention` |
| 37 | Покупатель отменил оплату / недостаточно средств | `payment.canceled` | Заказ остаётся `pending_payment`, на странице «Оплата не прошла» + «Оплатить» до истечения брони |
| 38 | Частичный возврат (например, брак одного диска) | Админ указывает сумму меньше оплаты | Запись `refunds`, статус заказа не меняется, в карточке — «Возвращено 33 400 ₽ из 133 700 ₽» |
| 39 | Ошибка чека 54-ФЗ при создании платежа | ЮKassa отвечает 400 `invalid_request` по `receipt` | Покупателю 502 с сохранённым заказом; админу Telegram с текстом ошибки ЮKassa; исправление — в настройках магазина ЮKassa или константе `YOOKASSA_VAT_CODE` |
| 40 | Возврат не прошёл | ЮKassa вернула `canceled` (например, на балансе магазина не хватает денег) | `refunds.status = 'failed'`, toast с причиной; статус заказа и остаток не меняются; админ повторяет позже |

### Время

| # | Ситуация | Триггер | Поведение системы |
|---|----------|---------|-------------------|
| 41 | Часовые пояса покупателей (Калининград — Владивосток) | Отображение дат | В БД всё `timestamptz` (UTC); на экране — `Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow' })` с подписью «МСК» в админке; даты доставки — диапазон дней без времени |
| 42 | Заказ в полночь 31 декабря | Номер заказа | Год в номере берётся по московскому времени (`now() at time zone 'Europe/Moscow'`) — заказ в 00:10 МСК 1 января получит `FC-27-…`; последовательность сквозная, номера не повторяются |
| 43 | Бронь истекает во время оплаты на странице ЮKassa | Покупатель платит 35 минут | Оплата всё равно принимается; если товар остался — заказ `paid` с отметкой «Оплачен после истечения брони»; если нет — кейс 11 |
| 44 | Курс ЦБ на выходные и праздники | Cron в субботу | ЦБ отдаёт курс с датой ближайшего рабочего дня; `on conflict do nothing` — повтор безопасен |
| 45 | Переход на летнее время | — | В России перехода нет с 2014 года; везде используется IANA-зона `Europe/Moscow`, поэтому при любом изменении правил достаточно обновления tzdata |
| 46 | Китайский Новый год и праздники поставщика | Срок поставки карбона растягивается | Админ увеличивает `lead_time_max_days` у товаров на период праздников (новые заказы видят честный срок) и сдвигает `expected_ready_at` у оплаченных (кейс 21) |

---

## Приложение A. Решения, принятые в Чертеже вместо Идеи

Генератор запрещает оставлять вопросы — ниже всё, что Идея не определяла или что пришлось решить. Владельцу стоит пробежать этот список: любое решение меняется правкой спецификации до старта сборки.

| # | Вопрос | Решение | Почему |
|---|--------|---------|--------|
| A1 | Название | Рабочее «ForgeCarbon», одна константа | Названия в Идее нет |
| A2 | Регистрация покупателя | Не нужна, заказ по email + ссылка | Розница покупает раз в несколько лет; лишний шаг снижает конверсию |
| A3 | Смешанная корзина | Наличие и под заказ — разными заказами | Разные сроки и статусы; одна оплата на один заказ |
| A4 | Стоимость доставки | Бесплатно везде | Идея: доставка покрыта наценкой; бренд: «вместо скидки — бесплатная доставка» |
| A5 | Интеграция со СДЭК | Вручную, без API | Экономия 6–8 часов при 10–15 заказах/мес |
| A6 | Совместимость дисков | Автоматически по параметрам + проверка инженером | Идея: «без ошибки в размере» |
| A7 | Совместимость карбона | Ручная привязка к автомобилям | Карбон делается под конкретный кузов |
| A8 | Цена | Закупка × курс ЦБ × 2, вверх до 100 ₽, автопересчёт при изменении курса ≥ 2% | Идея: наценка 100%, «курс меняется» |
| A9 | Бронь при оплате | 30 минут | Достаточно для оплаты, не держит склад долго |
| A10 | Цены ателье | Отдельное поле на товар, одобрение заявки вручную | Идея: отдельные цены после регистрации, условия позже |
| A11 | Активация и конверсия | См. 5.8 | Идея отложила на этап Чертежа |
| A12 | Почта | SMTP Яндекса | Бесплатно; встроенная почта Supabase не шлёт внешним адресатам |
| A13 | Самовывоз | Нет в MVP | Адрес склада не публикуется |
| A14 | Счёт для юрлиц | Нет в MVP, ателье платят картой/СБП | Срок 1 неделя |
| A15 | Уведомление Роскомнадзора | Подаётся до запуска | Идея просила проверить; решено подавать |
| A16 | SQL блока 2.0: порядок создания функций | `current_role_name` и `is_admin` создаются с `set check_function_bodies = off` | Иначе миграция падает: функция ссылается на `profiles`, которой ещё нет (найдено при проверке на PostgreSQL, День 1) |
| A17 | Права на служебные SQL-функции | `revoke … from public, anon, authenticated` + `grant … to service_role` | EXECUTE по умолчанию выдан PUBLIC, `revoke` только от anon/authenticated доступа не закрывал: anon вызывал `create_order` (найдено при проверке, День 1) |
| A18 | Чтение файлов бакета `product-images` | SELECT-политика на `storage.objects` только для admin | Storage API находит объекты для `remove`/`upsert`/`list` через SELECT: без политики замена и удаление фото в админке падают. Публичная отдача по URL от политики не зависит (ревью, День 1) |
| A19 | Дубли товара в `create_order` | Одна строка на товар, иначе `DUPLICATE_ITEMS` (бэкенд → 400 `VALIDATION_ERROR`) | `[{p,1},{p,1}]` проходил проверку остатка дважды (оверселл) и обходил `QTY_LIMIT` разбиением 2+2 (ревью, День 1) |
| A20 | Порядок блокировок в `create_order` | Строки товаров блокируются `for update` в порядке `product_id` | Два одновременных заказа с теми же товарами в разном порядке иначе могут поймать deadlock (ревью, День 1) |
| A21 | Права на `reserved_qty`, `available_qty`, `find_wheels_for_vehicle` | `revoke … from public, anon, authenticated` + `grant … to service_role` | Каталог читает только сервер; через `/rest/v1/rpc` anon видел остатки черновиков (ревью, День 1) |
| A22 | Разбор суммы ЮKassa (`rubStringToKopecks`) | Целочисленный разбор, невалидная строка бросает ошибку | `Math.round(Number(v)*100)` давал NaN/0; NULL в `p_amount` молча пропускал проверку суммы в `mark_order_paid` (найдено ревью, День 1) |

**Известные риски, которые код не закрывает (решает владелец):**
1. Vercel Hobby по условиям Vercel предназначен для некоммерческого использования. Для интернет-магазина нужен тариф Pro либо перенос фронтенда на VPS (Beget) — архитектура это позволяет без изменений кода (`next start` за nginx).
2. По 152-ФЗ первичная запись персональных данных граждан РФ должна вестись в базах на территории РФ; серверы Supabase находятся за пределами РФ. Для MVP риск принят; при росте — перенос PostgreSQL на российский хостинг.
3. ЮKassa подключается к ИП или юрлицу; самозанятые не могут перепродавать товары. Реквизиты продавца нужны в `src/lib/legal.ts` до сборки продакшн-версии.

## Приложение B. Чек-лист запуска (вне кода)

```
[ ] Supabase: проект создан, миграция 0001 и seed выполнены, SMTP Яндекса подключён, шаблоны писем на русском
[ ] Первый админ назначен SQL-запросом (2.17)
[ ] ЮKassa: магазин подключён, включены только «Банковские карты» и «СБП», чеки настроены, HTTP-уведомления → <SITE_URL>/api/webhooks/yookassa
[ ] Telegram: бот создан в @BotFather, webhook установлен скриптом, TELEGRAM_ADMIN_CHAT_ID проверен тестовым сообщением
[ ] Vercel: все переменные окружения заданы, cron виден в разделе Cron Jobs
[ ] src/lib/legal.ts заполнен, /privacy и /offer вычитаны
[ ] Уведомление об обработке ПДн подано на pd.rkn.gov.ru
[ ] Яндекс Метрика: счётчик создан, 7 целей добавлены, вебвизор выключен
[ ] Справочник автомобилей сверен инженером, заведено 20 позиций дисков и 5–10 позиций карбона (критерий успеха из Идеи)
[ ] Тестовый заказ на 1 ₽ (товар с ручной ценой, статус draft → active на время теста) проведён от оплаты до возврата
```

## Приложение C. Самопроверка по чек-листу справочника

```
[x] 1. Все 6 блоков присутствуют (+ Блок 0)
[x] 2. Data Model — готовый SQL
[x] 3. RLS для каждой таблицы, намеренно отсутствующие политики подписаны
[x] 4. API — примеры запросов и ответов для каждого эндпоинта
[x] 5. API — коды ошибок с JSON
[x] 6. UI/UX — Loading, Empty, Error для каждого экрана
[x] 7. Business Logic — все интеграции с retry и fallback
[x] 8. Edge Cases — 46 сценариев
[x] 9. Нет TODO, TBD, плейсхолдеров значений (секреты — через process.env)
[x] 10. Нет «по аналогии», «стандартный», «очевидно»
[x] 11. Все роли с правами доступа
[x] 12. Стек: Next.js 16, Tailwind v4, Supabase, ЮKassa; без Stripe и Edge Functions
```
