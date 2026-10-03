"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { AuthField } from "@/components/shop/auth/AuthField";
import { AuthFormError } from "@/components/shop/auth/AuthFormError";
import { AuthSubmitButton } from "@/components/shop/auth/AuthSubmitButton";
import { AUTH_FAILURE_MESSAGES } from "@/components/shop/auth/auth-messages";
import { PasswordField } from "@/components/shop/auth/PasswordField";
import { RegisterSuccess } from "@/components/shop/auth/RegisterSuccess";
import { Form } from "@/components/ui/form";
import { getAuthGateway, type AuthFailure } from "@/lib/auth-client";
import { nextQuery, safeNextPath } from "@/lib/auth-next";
import { registerBody, type RegisterValues } from "@/lib/schemas/auth";

interface RegisterFormProps {
  next: string | null;
  fixtures: boolean;
}

export function RegisterForm({ next, fixtures }: RegisterFormProps) {
  const gateway = useMemo(() => getAuthGateway(fixtures), [fixtures]);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<RegisterValues>({ resolver: zodResolver(registerBody), defaultValues: { full_name: "", email: "", password: "" } });
  const { isSubmitting } = form.formState;

  async function onSubmit(values: RegisterValues) {
    setFailure(null);
    const parsed = registerBody.parse(values);
    const res = await gateway.signUp({ email: parsed.email, password: parsed.password, fullName: parsed.full_name, next: safeNextPath(next) });
    if (!res.ok) {
      setFailure(res.reason);
      return;
    }
    setSentTo(parsed.email);
  }

  if (sentTo) return <RegisterSuccess email={sentTo} />;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Регистрация</h1>
        <AuthField control={form.control} name="full_name" label="Имя" autoComplete="name" />
        <AuthField control={form.control} name="email" label="Email" type="email" autoComplete="email" inputMode="email" />
        <PasswordField control={form.control} name="password" label="Пароль" autoComplete="new-password" description="8–72 символа, буква и цифра" />
        {failure && (
          <AuthFormError>
            {AUTH_FAILURE_MESSAGES[failure]}
            {failure === "already_registered" && (
              <>
                {" "}
                <Link href={`/auth/login${nextQuery(next)}`} className="underline underline-offset-4">
                  Войти?
                </Link>
              </>
            )}
          </AuthFormError>
        )}
        <AuthSubmitButton pending={isSubmitting}>Создать аккаунт</AuthSubmitButton>
        <p className="text-sm text-muted-foreground">
          Аккаунт нужен ателье. Для покупки в розницу регистрация не требуется.{" "}
          <Link href="/wheels" className="text-foreground underline underline-offset-4">
            В каталог
          </Link>
        </p>
        <Link href={`/auth/login${nextQuery(next)}`} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          Уже есть аккаунт? Войти
        </Link>
      </form>
    </Form>
  );
}
