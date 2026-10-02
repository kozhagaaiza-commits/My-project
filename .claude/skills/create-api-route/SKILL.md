---
name: create-api-route
description: "Creates a Next.js 16 Route Handler for ForgeCarbon following blueprint Block 3 conventions: Zod validation, auth, Origin check, rate limit, apiError responses, kopecks money. Use when adding or implementing an endpoint under src/app/api."
---
Создай Route Handler для: $ARGUMENTS

1. **Контракт.** Найди эндпоинт в `docs/blueprint.md`, Блок 3. Перенеси дословно: путь, метод, авторизацию, Zod-схему, JSON ответов, коды ошибок и тексты `message`. Если эндпоинта в Чертеже нет — спроси пользователя, прежде чем придумывать контракт.
2. **Документация.** Проверь через Context7 актуальный API Route Handlers Next.js 16 и Zod 4 (use context7).
3. **Схема.** Положи Zod-схему в `src/lib/schemas/<группа>.ts` (общие примитивы — из `common.ts`), экспортируй тип `z.infer`.
4. **Файл** `src/app/api/<path>/route.ts`, порядок внутри обработчика:
   ```ts
   export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
     try {
       // 1. Origin-проверка (только мутации, кроме /api/webhooks/* и /api/cron/*) → 403 FORBIDDEN
       // 2. Rate limit по таблице Блока 5.10 → 429 RATE_LIMITED + Retry-After
       // 3. Авторизация: const ctx = await getSessionContext(); 401 UNAUTHORIZED / 403 FORBIDDEN
       // 4. const { id } = await params; разбор query/body через schema.safeParse → 400 VALIDATION_ERROR (details.fields = z.flattenError(err).fieldErrors)
       // 5. Бизнес-логика: сессионный клиент (RLS) или service-role — только в местах из Блока 5.10
       // 6. Ответ: NextResponse.json({ data }, { status }) — деньги в копейках + *_formatted
     } catch (err) {
       console.error({ scope: "<group>.<action>", err });
       return apiError("INTERNAL_ERROR", "Что-то пошло не так. Мы уже разбираемся", 500);
     }
   }
   ```
5. **Ошибки.** Только `apiError(code, message, status, details?)`; коды — из `ApiErrorCode`. Ошибки SQL-функций (`P0001`, сообщения из Блока 2.14) маппь в коды Блока 3.
6. **Безопасность.** Не отдавать `purchase_cost`, `purchase_currency`, `pricing_mode`; `price_atelier` — только при `ctx.atelierId`. Публичный каталог — `PUBLIC_PRODUCT_COLUMNS` + `toPublicProduct()`.
7. **Кэш.** Справочники (`/api/vehicles/*`) — `export const revalidate = 3600` по Чертежу; всё, что зависит от сессии или заказа, — динамическое.
8. **Проверка.** `npx tsc --noEmit`, `npm run lint`; ручной вызов `curl` с примером запроса из Блока 3 (успех и минимум одна ошибка). Затем передай `qa-reviewer` на ревью.
