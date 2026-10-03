# Подключение MCP-серверов — ForgeCarbon

## Обязательные

### Context7 — актуальная документация библиотек
Уже подключён на уровне проекта в `.mcp.json` (и разрешён в `.claude/settings.json`). Ничего делать не нужно — при первом запуске Claude Code он появится в `/mcp`.

Если хочешь подключить его для всех проектов (или с ключом для повышенных лимитов):

```bash
# Вариант 1: удалённый сервер (рекомендуется, Node.js не нужен)
claude mcp add --scope user --transport http context7 https://mcp.context7.com/mcp

# Вариант 2: с API-ключом (бесплатный ключ на context7.com/dashboard)
claude mcp add --scope user --transport http --header "CONTEXT7_API_KEY: ТВОЙ_КЛЮЧ" context7 https://mcp.context7.com/mcp

# Вариант 3: локально через npx (нужен Node.js 18+)
claude mcp add context7 -- npx -y @upstash/context7-mcp@latest
```

Как использовать — добавляй `use context7` в конец запроса:
```
Создай src/proxy.ts в Next.js 16 для обновления сессии Supabase. use context7
Настрой Supabase Auth с email/password через @supabase/ssr. use context7
Создай форму с react-hook-form и Zod 4. use context7
```

### Supabase — прямой доступ к базе данных
Подключается **после** создания проекта в Supabase (День 1). `PROJECT_REF` — из адреса проекта `https://<project-ref>.supabase.co` (Supabase → Settings → General → Reference ID).

```bash
claude mcp add supabase --transport http "https://mcp.supabase.com/mcp?project_ref=PROJECT_REF"
```

При первом обращении Claude Code попросит авторизоваться в Supabase через браузер (`/mcp` → supabase → Authenticate).

## Рекомендуемые

```bash
# GitHub — управление PR, issues, CI/CD
claude mcp add github -s user -e GITHUB_TOKEN=ghp_xxx -- npx -y @modelcontextprotocol/server-github
```

Других MCP проекту не нужно: ЮKassa, Telegram, SMTP и ЦБ работают через свои HTTP API из кода.

## Проверка
```bash
claude mcp list
```
Или внутри Claude Code: `/mcp`.

## Опционально — community-плагины
Всё работает и без них. Если хочешь расширить возможности, скажи Claude Code:
- «Установи obra/superpowers» — 20+ скиллов для TDD, отладки, code review
- «Установи VoltAgent/awesome-claude-code-subagents» — 100+ готовых субагентов
