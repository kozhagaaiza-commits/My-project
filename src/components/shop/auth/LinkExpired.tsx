import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AUTH_FAILURE_MESSAGES } from "@/components/shop/auth/auth-messages";

/** Ссылка устарела / сессии нет (US-011, шаг 6): сообщение + кнопка на /auth/forgot-password. */
export function LinkExpired() {
  return (
    <div className="flex flex-col gap-4" role="alert">
      <h1 className="text-xl font-semibold tracking-tight">{AUTH_FAILURE_MESSAGES.link_expired}</h1>
      <Button asChild>
        <Link href="/auth/forgot-password">Запросить новую ссылку</Link>
      </Button>
    </div>
  );
}
