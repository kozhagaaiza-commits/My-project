"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { MailCheck } from "lucide-react";
import { AuthField } from "@/components/shop/auth/AuthField";
import { AuthFormError } from "@/components/shop/auth/AuthFormError";
import { AuthSubmitButton } from "@/components/shop/auth/AuthSubmitButton";
import { AUTH_FAILURE_MESSAGES } from "@/components/shop/auth/auth-messages";
import { Form } from "@/components/ui/form";
import { getAuthGateway, type AuthFailure } from "@/lib/auth-client";
import { forgotPasswordBody, type ForgotPasswordValues } from "@/lib/schemas/auth";

export function ForgotPasswordForm({ fixtures }: { fixtures: boolean }) {
  const gateway = useMemo(() => getAuthGateway(fixtures), [fixtures]);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [sent, setSent] = useState(false);
  const form = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordBody), defaultValues: { email: "" } });
  const { isSubmitting } = form.formState;

  async function onSubmit(values: ForgotPasswordValues) {
    setFailure(null);
    const res = await gateway.requestPasswordReset(forgotPasswordBody.parse(values).email);
    // Ответ одинаков для существующих и несуществующих email (US-011): Supabase ошибку для них не отдаёт.
    if (res.ok) setSent(true);
    else setFailure(res.reason);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <MailCheck className="size-10 text-primary" aria-hidden />
        <p className="text-base font-medium">Если аккаунт с таким email есть, письмо отправлено</p>
        <Link href="/auth/login" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground max-md:inline-flex max-md:min-h-11 max-md:items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          Вернуться ко входу
        </Link>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Восстановление пароля</h1>
        <AuthField control={form.control} name="email" label="Email" type="email" autoComplete="email" inputMode="email" />
        {failure && <AuthFormError>{AUTH_FAILURE_MESSAGES[failure]}</AuthFormError>}
        <AuthSubmitButton pending={isSubmitting}>Отправить ссылку</AuthSubmitButton>
        <Link href="/auth/login" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          Вернуться ко входу
        </Link>
      </form>
    </Form>
  );
}
