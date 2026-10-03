import Link from "next/link";
import { MailCheck } from "lucide-react";

/** Успех регистрации (Блок 4): «Проверьте почту <email> — там ссылка для подтверждения». */
export function RegisterSuccess({ email }: { email: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center" role="status">
      <MailCheck className="size-10 text-primary" aria-hidden />
      <h1 className="text-xl font-semibold tracking-tight">
        Проверьте почту <span className="font-mono break-all">{email}</span> — там ссылка для подтверждения
      </h1>
      <Link href="/wheels" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
        В каталог
      </Link>
    </div>
  );
}
