---
description: Правила использования Context7 для актуальной документации
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.mjs"
---
- При работе с ЛЮБОЙ внешней библиотекой — используй Context7 MCP для проверки актуального API.
- Если используешь Next.js, React, Supabase, Tailwind, shadcn/ui, Zod, react-hook-form, nodemailer, sonner — ОБЯЗАТЕЛЬНО запроси документацию через Context7 перед написанием кода.
- Если не уверен в API метода или компонента — сначала запроси через Context7, потом пиши код.
- Для указания конкретной библиотеки используй синтаксис: `use library /supabase/supabase`.
- Для конкретной версии упоминай версию в запросе: «Next.js 16 app router proxy.ts. use context7», «Tailwind CSS v4 @theme. use context7», «Zod 4 flattenError. use context7».
- Версии проекта: Next.js 16, React 19.2, Tailwind v4, Zod 4, react-hook-form 7, @supabase/ssr, nodemailer 7.
