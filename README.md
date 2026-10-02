# ForgeCarbon

Интернет-магазин кованых дисков и карбона для Audi, BMW, Mercedes-Benz.

Конвейер клуба Airo: Идея → Чертёж → **Наладка** ✅ → Сборка → Отгрузка.

| Файл | Что это |
|------|---------|
| `docs/blueprint.md` | Чертёж — техническая спецификация, источник истины |
| `CLAUDE.md` | Главный файл проекта для Claude Code |
| `.claude/agents/` | 6 субагентов: database-architect, backend-engineer, payments-specialist, integrations-engineer, frontend-developer, qa-reviewer |
| `.claude/rules/` | Правила по контекстам: database, api, components, context7, payments, integrations |
| `.claude/skills/` | implement-feature, create-migration, create-api-route |
| `SPEC_TEMPLATE.md` | Шаблон спецификации новой фичи |
| `.mcp.json`, `docs/mcp-setup.md` | MCP: Context7 (подключён), Supabase, GitHub |
| `docs/START_BUILD.md` | Промпты автономной сборки по дням |

Старт сборки — `docs/START_BUILD.md`, День 1.
