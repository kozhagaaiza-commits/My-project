"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { AuthField } from "@/components/shop/auth/AuthField";
import { AuthFormError } from "@/components/shop/auth/AuthFormError";
import { AuthSubmitButton } from "@/components/shop/auth/AuthSubmitButton";
import { AUTH_FAILURE_MESSAGES, LINK_EXPIRED_LOGIN_MESSAGE } from "@/components/shop/auth/auth-messages";
import { PasswordField } from "@/components/shop/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { getAuthGateway, type AuthFailure } from "@/lib/auth-client";
import { DEFAULT_NEXT, nextQuery, safeNextPath } from "@/lib/auth-next";
import { loginBody, type LoginValues } from "@/lib/schemas/auth";

interface LoginFormProps {
  /** Сырое значение ?next= — безопасность проверяется здесь и ещё раз при переходе. */
  next: string | null;
  linkExpired: boolean;
  fixtures: boolean;
}

export function LoginForm({ next, linkExpired, fixtures }: LoginFormProps) {
  const router = useRouter();
  const gateway = useMemo(() => getAuthGateway(fixtures), [fixtures]);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [resending, setResending] = useState(false);
  const form = useForm<LoginValues>({ resolver: zodResolver(loginBody), defaultValues: { email: "", password: "" } });
  const { isSubmitting } = form.formState;
  const target = safeNextPath(next);

  async function onSubmit(values: LoginValues) {
    setFailure(null);
    const parsed = loginBody.parse(values);
    const res = await gateway.signIn(parsed.email, parsed.password);
    if (!res.ok) {
      setFailure(res.reason);
      return;
    }
    // next задан — идём туда; иначе admin → /admin, остальные → /account (Блок 5, «Вход»).
    const explicitNext = safeNextPath(next, "");
    const destination = explicitNext || (res.role === "admin" ? "/admin" : DEFAULT_NEXT);
    router.replace(destination);
    router.refresh();
  }

  async function resend() {
    setResending(true);
    const res = await gateway.resendSignup(form.getValues("email").trim().toLowerCase(), target);
    setResending(false);
    if (res.ok) {
      toast.success("Письмо отправлено");
      setFailure(null);
    } else {
      setFailure(res.reason);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Вход</h1>
        {linkExpired && !failure && <AuthFormError>{LINK_EXPIRED_LOGIN_MESSAGE}</AuthFormError>}
        <AuthField control={form.control} name="email" label="Email" type="email" autoComplete="email" inputMode="email" />
        <PasswordField control={form.control} name="password" label="Пароль" autoComplete="current-password" />
        {failure && (
          <AuthFormError>
            {AUTH_FAILURE_MESSAGES[failure]}
            {failure === "email_not_confirmed" && (
              <Button type="button" variant="ghost" size="sm" className="mt-2 w-full" disabled={resending} onClick={resend}>
                Отправить письмо повторно
              </Button>
            )}
          </AuthFormError>
        )}
        <AuthSubmitButton pending={isSubmitting}>Войти</AuthSubmitButton>
        <div className="flex flex-col gap-1 text-sm">
          <Link href="/auth/forgot-password" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Забыли пароль?
          </Link>
          <Link href={`/auth/register${nextQuery(next)}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Нет аккаунта? Зарегистрироваться
          </Link>
        </div>
      </form>
    </Form>
  );
}
