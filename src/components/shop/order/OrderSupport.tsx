import { MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";

interface OrderSupportProps {
  /** Имя бота из env.TELEGRAM_BOT_USERNAME (читается на сервере). */
  botUsername: string;
}

/** Блок «Вопрос по заказу?» → Telegram-бот. */
export function OrderSupport({ botUsername }: OrderSupportProps) {
  return (
    <Card className="gap-1 p-5" role="region" aria-label="Вопрос по заказу">
      <h2 className="text-lg font-semibold">Вопрос по заказу?</h2>
      <p className="text-sm text-muted-foreground">Напишите в Telegram и укажите номер заказа.</p>
      <a
        href={`https://t.me/${encodeURIComponent(botUsername)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex w-fit items-center gap-2 text-sm text-silver underline underline-offset-4 hover:text-foreground"
      >
        <MessageCircle className="size-4" aria-hidden />
        @{botUsername}
      </a>
    </Card>
  );
}
