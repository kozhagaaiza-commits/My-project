import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Гость: «Зарегистрироваться» (default) → /auth/register?next=/atelier и «Войти» (outline). */
export function AtelierGuestActions() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Аккаунт нужен ателье. Для покупки в розницу регистрация не требуется.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href="/auth/register?next=/atelier">Зарегистрироваться</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/auth/login?next=/atelier">Войти</Link>
        </Button>
      </div>
    </div>
  );
}
