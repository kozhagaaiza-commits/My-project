import "server-only";
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
