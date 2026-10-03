"use client";

import { BellRing, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reachGoal } from "@/lib/analytics";
import { safeNavigationUrl } from "@/lib/checkout-response";

interface TelegramBlockProps {
  subscribed: boolean;
  /** telegram_link приходит только при доступе по токену. */
  link: string | null;
}

/** outline «Получать статусы в Telegram» → бот; если уже подписан — «Статусы приходят в Telegram». */
export function TelegramBlock({ subscribed, link }: TelegramBlockProps) {
  if (subscribed) {
    return (
      <p className="flex items-center gap-2 text-sm text-silver" data-testid="telegram-subscribed">
        <BellRing className="size-4" aria-hidden />
        Статусы приходят в Telegram
      </p>
    );
  }
  const href = link ? safeNavigationUrl(link) : null;
  if (!href) return null;
  return (
    <Button asChild variant="outline" className="w-full">
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => reachGoal("telegram_subscribed")}>
        <Send aria-hidden />
        Получать статусы в Telegram
      </a>
    </Button>
  );
}
