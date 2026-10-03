// Значения переменных окружения нужного формата для node:test: env.ts валидирует process.env при импорте.
// Применять ДО динамического import() модулей, которые тянут env.ts (rate-limit, supabase/admin, orders/token).
export const TEST_ENV: Record<string, string> = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40), SUPABASE_SERVICE_ROLE_KEY: "s".repeat(40), YOOKASSA_SHOP_ID: "123456",
  YOOKASSA_SECRET_KEY: "test_secret_key", TELEGRAM_BOT_TOKEN: `123456:${"A".repeat(35)}`, TELEGRAM_BOT_USERNAME: "forgecarbon_bot",
  TELEGRAM_WEBHOOK_SECRET: "w".repeat(32), TELEGRAM_ADMIN_CHAT_ID: "-100123", SMTP_HOST: "smtp.yandex.ru", SMTP_PORT: "465",
  SMTP_USER: "orders@forgecarbon.ru", SMTP_PASSWORD: "password1", CRON_SECRET: "c".repeat(32),
  ORDER_TOKEN_SECRET: "test-order-token-secret-0123456789abcdef",
};

export function applyTestEnv(): void {
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] ??= v;
}
