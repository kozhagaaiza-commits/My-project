// Контракт проверки администратора для обработчиков /api/admin/products*, /api/admin/vehicles*,
// /api/admin/prices/* (Блок 3.0, 5.10). Реализация — requireAdminApi из src/lib/admin/guard.ts (backend A):
// сессия (401) → роль (403) → Origin на мутациях (403, A27) → rate limit admin:<user.id> 300 / 60 с (429).
// null — запрос от администратора; иначе готовый ответ-ошибка. В тестах подменяется.

export type RequireAdmin = (request: Request) => Promise<Response | null>;
