import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { one } from "@/lib/catalog/db";
import type { TelegramBotDeps } from "@/app/api/webhooks/telegram/handler";

// Доступ бота к orders (service-role, Блок 5.10: webhook'и): поиск заказа по sha256 токена, запись/сброс telegram_chat_id.
// public_token_hash и telegram_chat_id скрыты от роли authenticated колоночными правами (A23) — читаются только отсюда.

const orderRow = z.object({ id: z.string(), number: z.string(), status: z.string() });

export function createBotOrdersRepo(c: SupabaseClient): TelegramBotDeps["orders"] {
  return {
    async findByTokenHash(hash) {
      const res = await c.from("orders").select("id,number,status").eq("public_token_hash", hash).maybeSingle();
      return one(orderRow, res, "orders.byTokenHash");
    },
    async subscribe(orderId, chatId) {
      const { error } = await c.from("orders").update({ telegram_chat_id: Number(chatId) }).eq("id", orderId);
      if (error) throw new Error(`orders.subscribe: ${error.code ?? ""} ${error.message}`);
    },
    async unsubscribe(chatId) {
      const { error } = await c.from("orders").update({ telegram_chat_id: null }).eq("telegram_chat_id", Number(chatId));
      if (error) throw new Error(`orders.unsubscribe: ${error.code ?? ""} ${error.message}`);
    },
  };
}
