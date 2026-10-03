"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { LinkExpired } from "@/components/shop/auth/LinkExpired";
import { AuthFormError } from "@/components/shop/auth/AuthFormError";
import { AuthSubmitButton } from "@/components/shop/auth/AuthSubmitButton";
import { AUTH_FAILURE_MESSAGES } from "@/components/shop/auth/auth-messages";
import { PasswordField } from "@/components/shop/auth/PasswordField";
import { Form } from "@/components/ui/form";
import { getAuthGateway, type AuthFailure } from "@/lib/auth-client";
import { PASSWORD_MESSAGE, updatePasswordBody, type UpdatePasswordValues } from "@/lib/schemas/auth";

export function UpdatePasswordForm({ fixtures }: { fixtures: boolean }) {
  const router = useRouter();
  const gateway = useMemo(() => getAuthGateway(fixtures), [fixtures]);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const form = useForm<UpdatePasswordValues>({ resolver: zodResolver(updatePasswordBody), defaultValues: { password: "", password_repeat: "" } });
  const { isSubmitting } = form.formState;

  async function onSubmit(values: UpdatePasswordValues) {
    setFailure(null);
    const res = await gateway.updatePassword(updatePasswordBody.parse(values).password);
    if (!res.ok) {
      setFailure(res.reason);
      return;
    }
    toast.success("Пароль изменён");
    router.replace("/account");
    router.refresh();
  }

  if (failure === "link_expired") return <LinkExpired />;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Новый пароль</h1>
        <PasswordField control={form.control} name="password" label="Новый пароль" autoComplete="new-password" description={PASSWORD_MESSAGE} />
        <PasswordField control={form.control} name="password_repeat" label="Повтор пароля" autoComplete="new-password" />
        {failure && <AuthFormError>{AUTH_FAILURE_MESSAGES[failure]}</AuthFormError>}
        <AuthSubmitButton pending={isSubmitting}>Сохранить пароль</AuthSubmitButton>
      </form>
    </Form>
  );
}
